#!/usr/bin/env node
// Simulation (backtest) : rejoue l'historique et fait trader chaque stratégie avec un capital fictif.
//
//   node src/backtest.js --pair BTCUSDT --interval 1h --days 30 --capital 100000 --strategy all
//   node src/backtest.js --offline --strategy sma          (données synthétiques, sans Internet)
//   node src/backtest.js --strategy claude --every 4 --max-calls 60   (agent IA, nécessite ANTHROPIC_API_KEY)

import { fetchCandles, syntheticCandles } from "./data.js";
import { computeAll } from "./indicators.js";
import { PaperBroker } from "./broker.js";
import { strategies } from "./strategies.js";
import { parseArgs, fmtXOF, fmtPct } from "./args.js";

const a = parseArgs();
const pair = (a.pair || "BTCUSDT").toUpperCase();
const interval = a.interval || "1h";
const days = +(a.days || 30);
const capitalXOF = +(a.capital || 100000);
const xofPerUsdt = +(a["xof-rate"] || 600); // taux approximatif, à ajuster selon le P2P du jour
const every = +(a.every || 4);
const maxCalls = +(a["max-calls"] || 60);
const which = a.strategy || "all";

const WARMUP = 50; // bougies nécessaires pour calculer les indicateurs

async function run(name, candles, ind, decideFn, stepEvery = 1) {
  const broker = new PaperBroker({
    cash: capitalXOF / xofPerUsdt,
    maxPositionPct: +(a["max-position"] || 0.5),
    stopLossPct: +(a["stop-loss"] || 0.05),
  });
  for (let i = WARMUP; i < candles.length; i++) {
    const c = candles[i];
    broker.checkStop(c);
    if ((i - WARMUP) % stepEvery === 0) {
      const price = c.close;
      const pos = {
        inPosition: broker.qty > 0,
        exposurePct: (broker.qty * price) / broker.equity(price),
        entryPrice: broker.entryPrice,
        stopPrice: broker.stopPrice,
        unrealizedPct: broker.qty > 0 ? price / broker.entryPrice - 1 : 0,
        totalReturnPct: broker.equity(price) / (capitalXOF / xofPerUsdt) - 1,
      };
      const d = await decideFn(i, candles, ind, pos);
      if (d.action === "BUY") broker.buy(price, c.time, d.fraction ?? 1, d.stopLossPct, d.reason);
      else if (d.action === "SELL") broker.sell(price, c.time, d.reason);
    }
    broker.mark(c);
  }
  return summarize(name, broker, candles);
}

function summarize(name, broker, candles) {
  const last = candles[candles.length - 1].close;
  const start = capitalXOF / xofPerUsdt;
  const final = broker.equity(last);
  let peak = -Infinity, maxDD = 0;
  for (const p of broker.equityCurve) { peak = Math.max(peak, p.equity); maxDD = Math.max(maxDD, 1 - p.equity / peak); }
  const sells = broker.trades.filter((t) => t.side === "VENTE");
  const wins = sells.filter((t) => t.pnl > 0).length;
  return {
    name, broker,
    finalXOF: final * xofPerUsdt,
    ret: final / start - 1,
    maxDD,
    trades: broker.trades.length,
    winRate: sells.length ? wins / sells.length : null,
    feesXOF: broker.feesPaid * xofPerUsdt,
  };
}

async function main() {
  let candles;
  if (a.offline) {
    candles = syntheticCandles(days * 24);
    console.log(`Données SYNTHÉTIQUES (${candles.length} bougies) — pour tester le programme uniquement.\n`);
  } else {
    console.log(`Téléchargement de ${pair} (${interval}, ${days} jours) depuis Binance…`);
    candles = await fetchCandles(pair, interval, days);
    console.log(`${candles.length} bougies reçues.\n`);
  }
  if (candles.length < WARMUP + 10) throw new Error("Pas assez de données : augmentez --days.");
  const ind = computeAll(candles);

  const names = which === "all" ? ["sma", "rsi", ...(process.env.ANTHROPIC_API_KEY ? ["claude"] : [])] : which.split(",");
  const results = [];

  // Référence : acheter au début et ne rien faire (« buy and hold »).
  const bh = candles[candles.length - 1].close / candles[WARMUP].close - 1;

  for (const n of names) {
    if (n === "claude") {
      const { ClaudeTrader } = await import("./agent.js");
      const trader = new ClaudeTrader({ model: a.model, effort: a.effort });
      const steps = Math.ceil((candles.length - WARMUP) / every);
      const step = steps > maxCalls ? Math.ceil((candles.length - WARMUP) / maxCalls) : every;
      console.log(`Agent Claude : environ ${Math.ceil((candles.length - WARMUP) / step)} décisions (une toutes les ${step} bougies)…`);
      const r = await run("claude", candles, ind, async (...args) => {
        const d = await trader.decide(...args);
        if (d.action !== "HOLD" || a.verbose) console.log(`  [${new Date(args[1][args[0]].time).toISOString().slice(0, 16)}] ${d.action} — ${d.reason}`);
        return d;
      }, step);
      r.usage = trader.usage;
      results.push(r);
    } else if (strategies[n]) {
      results.push(await run(n, candles, ind, strategies[n]));
    } else {
      console.log(`Stratégie inconnue : ${n} (choix : sma, rsi, claude, all)`);
    }
  }

  console.log(`\n=== Résultats — capital de départ ${fmtXOF(capitalXOF)} (1 USDT ≈ ${xofPerUsdt} FCFA) ===`);
  console.log(`Référence « acheter et garder » : ${fmtPct(bh)}  →  ${fmtXOF(capitalXOF * (1 + bh))}\n`);
  for (const r of results) {
    console.log(`▸ ${r.name.toUpperCase()}`);
    console.log(`   Capital final : ${fmtXOF(r.finalXOF)}  (${fmtPct(r.ret)})`);
    console.log(`   Pire baisse   : -${(r.maxDD * 100).toFixed(2)} %`);
    console.log(`   Ordres        : ${r.trades}   Ventes gagnantes : ${r.winRate === null ? "—" : Math.round(r.winRate * 100) + " %"}   Frais : ${fmtXOF(r.feesXOF)}`);
    if (r.usage) console.log(`   Jetons IA     : ${r.usage.input} entrée, ${r.usage.output} sortie, ${r.usage.cacheRead} lus en cache`);
    if (a.trades) for (const t of r.broker.trades) console.log(`     ${new Date(t.time).toISOString().slice(0, 16)} ${t.side} @ ${t.price.toFixed(2)}${t.pnl !== undefined ? `  résultat ${fmtXOF(t.pnl * xofPerUsdt)}` : ""}  ${t.reason || ""}`);
  }
  console.log("\nRappel : de bons résultats passés ne garantissent rien pour l'avenir.");
}

main().catch((e) => { console.error("Erreur :", e.message); process.exit(1); });
