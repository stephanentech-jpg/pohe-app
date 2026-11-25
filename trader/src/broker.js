// Courtier fictif (paper trading) : aucun argent réel n'est engagé.
// Frais et glissement simulés pour rester réaliste.

export class PaperBroker {
  constructor({ cash, feeRate = 0.001, slippage = 0.0005, maxPositionPct = 0.5, stopLossPct = 0.05 }) {
    this.cash = cash;            // en USDT
    this.qty = 0;                // quantité de l'actif détenue
    this.entryPrice = null;
    this.stopPrice = null;
    this.feeRate = feeRate;
    this.slippage = slippage;
    this.maxPositionPct = maxPositionPct; // part max du capital investie
    this.defaultStopLossPct = stopLossPct;
    this.trades = [];
    this.equityCurve = [];
    this.feesPaid = 0;
  }

  equity(price) { return this.cash + this.qty * price; }

  // fraction : part du capital total visée en position (0 → 1), plafonnée par maxPositionPct
  buy(price, time, fraction = 1, stopLossPct = this.defaultStopLossPct, reason = "") {
    const target = Math.min(fraction, 1) * this.maxPositionPct * this.equity(price);
    const already = this.qty * price;
    const spend = Math.min(target - already, this.cash);
    if (spend < 1) return false;
    const fill = price * (1 + this.slippage);
    const fee = spend * this.feeRate;
    const q = (spend - fee) / fill;
    this.entryPrice = this.qty > 0 ? (this.entryPrice * this.qty + fill * q) / (this.qty + q) : fill;
    this.qty += q;
    this.cash -= spend;
    this.feesPaid += fee;
    this.stopPrice = this.entryPrice * (1 - stopLossPct);
    this.trades.push({ side: "ACHAT", time, price: fill, qty: q, value: spend, reason });
    return true;
  }

  sell(price, time, reason = "") {
    if (this.qty <= 0) return false;
    const fill = price * (1 - this.slippage);
    const gross = this.qty * fill;
    const fee = gross * this.feeRate;
    const pnl = gross - fee - this.qty * this.entryPrice;
    this.cash += gross - fee;
    this.feesPaid += fee;
    this.trades.push({ side: "VENTE", time, price: fill, qty: this.qty, value: gross - fee, pnl, reason });
    this.qty = 0; this.entryPrice = null; this.stopPrice = null;
    return true;
  }

  // Le stop-loss est appliqué par le courtier, quelle que soit la stratégie.
  checkStop(candle) {
    if (this.qty > 0 && this.stopPrice && candle.low <= this.stopPrice) {
      this.sell(this.stopPrice, candle.time, "stop-loss");
      return true;
    }
    return false;
  }

  mark(candle) { this.equityCurve.push({ time: candle.time, equity: this.equity(candle.close) }); }
}
