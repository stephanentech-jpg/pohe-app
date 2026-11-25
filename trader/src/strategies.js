// Stratégies de référence (sans IA). Chacune renvoie { action, fraction?, reason }.
// action : "BUY" | "SELL" | "HOLD"

export const strategies = {
  // Croisement de moyennes mobiles : suit la tendance.
  sma: (i, candles, ind, pos) => {
    const f = ind.sma20[i], s = ind.sma50[i], pf = ind.sma20[i - 1], ps = ind.sma50[i - 1];
    if ([f, s, pf, ps].includes(null)) return { action: "HOLD" };
    if (pf <= ps && f > s && !pos.inPosition) return { action: "BUY", fraction: 1, reason: "SMA20 croise au-dessus de SMA50" };
    if (pf >= ps && f < s && pos.inPosition) return { action: "SELL", reason: "SMA20 croise sous SMA50" };
    return { action: "HOLD" };
  },

  // RSI : achète la survente, vend le surachat (retour à la moyenne).
  rsi: (i, candles, ind, pos) => {
    const r = ind.rsi14[i];
    if (r === null) return { action: "HOLD" };
    if (r < 30 && !pos.inPosition) return { action: "BUY", fraction: 1, reason: `RSI ${r.toFixed(0)} < 30 (survente)` };
    if (r > 70 && pos.inPosition) return { action: "SELL", reason: `RSI ${r.toFixed(0)} > 70 (surachat)` };
    return { action: "HOLD" };
  },
};
