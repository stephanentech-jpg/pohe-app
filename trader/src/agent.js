// Agent IA : Claude analyse le marché et décide ACHETER / VENDRE / ATTENDRE.
// Les prix sont envoyés en base 100, sans nom d'actif ni date, pour éviter que
// le modèle « se souvienne » de l'historique réel (biais d'anticipation).

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

const Decision = z.object({
  action: z.enum(["BUY", "SELL", "HOLD"]),
  fraction: z.number().describe("Part de l'allocation maximale à investir pour un BUY, entre 0 et 1"),
  stop_loss_pct: z.number().describe("Stop-loss sous le prix d'entrée, en fraction (ex. 0.04 = 4 %), entre 0.01 et 0.15"),
  confidence: z.number().describe("Confiance entre 0 et 1"),
  reason: z.string().describe("Justification courte, en français, une phrase"),
});

const SYSTEM = `Tu es un trader prudent qui gère un portefeuille de simulation.
On te donne les dernières bougies d'un actif (prix ramenés en base 100), des indicateurs techniques et l'état de la position.
Ta priorité est de préserver le capital : tu n'entres que lorsque le rapport risque/rendement est clairement favorable,
et tu sors quand la tendance se retourne. Rester à l'écart (HOLD) est souvent la meilleure décision.
Les frais sont de 0,1 % par ordre : évite les allers-retours inutiles.
Un BUY alors que tu es déjà en position renforce la position ; un SELL vend tout.
Réponds uniquement avec la décision demandée.`;

const r2 = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);

export class ClaudeTrader {
  constructor({ model = "claude-opus-5-5", effort = "medium", lookback = 48 } = {}) {
    this.client = new Anthropic();
    this.model = model;
    this.effort = effort;
    this.lookback = lookback;
    this.calls = 0;
    this.usage = { input: 0, output: 0, cacheRead: 0 };
  }

  buildPrompt(i, candles, ind, pos) {
    const from = Math.max(0, i - this.lookback + 1);
    const base = candles[from].close;
    const n = (p) => r2((p / base) * 100);
    const rows = candles.slice(from, i + 1).map((c) => [n(c.open), n(c.high), n(c.low), n(c.close)].join(","));
    const close = candles[i].close;
    const state = pos.inPosition
      ? `EN POSITION : ${r2(pos.exposurePct * 100)} % du capital investi, prix d'entrée ${n(pos.entryPrice)}, stop ${n(pos.stopPrice)}, résultat latent ${r2(pos.unrealizedPct * 100)} %`
      : "PAS DE POSITION (100 % en liquidités)";
    return `Bougies (open,high,low,close), de la plus ancienne à la plus récente :
${rows.join("\n")}

Indicateurs sur la dernière bougie :
- SMA20 = ${n(ind.sma20[i])}, SMA50 = ${n(ind.sma50[i])}
- EMA12 = ${n(ind.ema12[i])}, EMA26 = ${n(ind.ema26[i])}
- RSI14 = ${r2(ind.rsi14[i])}
- ATR14 = ${r2((ind.atr14[i] / close) * 100)} % du prix

Portefeuille : ${state}. Performance totale depuis le début : ${r2(pos.totalReturnPct * 100)} %.

Quelle est ta décision pour la prochaine période ?`;
  }

  async decide(i, candles, ind, pos) {
    this.calls++;
    let res;
    try {
      res = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: this.effort, format: betaZodOutputFormat(Decision) },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: this.buildPrompt(i, candles, ind, pos) }],
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error("Clé API invalide : vérifiez ANTHROPIC_API_KEY.");
      if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError) {
        return { action: "HOLD", reason: `Erreur temporaire de l'API (${err.constructor.name}), on attend.` };
      }
      throw err;
    }
    this.usage.input += res.usage.input_tokens ?? 0;
    this.usage.output += res.usage.output_tokens ?? 0;
    this.usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
    if (res.stop_reason === "refusal" || !res.parsed_output) {
      return { action: "HOLD", reason: "Pas de décision exploitable, on attend." };
    }
    const d = res.parsed_output;
    return {
      action: d.action,
      fraction: Math.min(Math.max(d.fraction, 0), 1),
      stopLossPct: Math.min(Math.max(d.stop_loss_pct, 0.01), 0.15),
      reason: `${d.reason} (confiance ${Math.round(d.confidence * 100)} %)`,
    };
  }
}
