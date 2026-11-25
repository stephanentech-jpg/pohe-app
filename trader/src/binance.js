// Connecteur Binance Spot (ordres RÉELS). Clés lues dans les variables d'environnement :
//   BINANCE_API_KEY, BINANCE_API_SECRET
// Créez une clé avec UNIQUEMENT « Enable Spot & Margin Trading » — JAMAIS « Enable Withdrawals » —
// et restreignez-la à l'adresse IP de votre machine.

import crypto from "node:crypto";

export class Binance {
  constructor({ testnet = false } = {}) {
    this.base = testnet ? "https://testnet.binance.vision" : "https://api.binance.com";
    this.key = process.env.BINANCE_API_KEY;
    this.secret = process.env.BINANCE_API_SECRET;
    this.filters = {};
  }

  requireKeys() {
    if (!this.key || !this.secret) {
      throw new Error("BINANCE_API_KEY et BINANCE_API_SECRET doivent être définis (voir README).");
    }
  }

  async publicGet(path, params = {}) {
    const res = await fetch(`${this.base}${path}?${new URLSearchParams(params)}`);
    const body = await res.json();
    if (!res.ok) throw new Error(`Binance ${res.status} : ${body.msg || JSON.stringify(body)}`);
    return body;
  }

  async signed(method, path, params = {}) {
    this.requireKeys();
    const qs = new URLSearchParams({ ...params, recvWindow: "10000", timestamp: String(Date.now()) });
    const sig = crypto.createHmac("sha256", this.secret).update(qs.toString()).digest("hex");
    qs.append("signature", sig);
    const res = await fetch(`${this.base}${path}?${qs}`, { method, headers: { "X-MBX-APIKEY": this.key } });
    const body = await res.json();
    if (!res.ok) throw new Error(`Binance ${res.status} : ${body.msg || JSON.stringify(body)}`);
    return body;
  }

  async candles(symbol, interval, limit = 120) {
    const rows = await this.publicGet("/api/v3/klines", { symbol, interval, limit });
    return rows.map((r) => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5], closeTime: r[6] }));
  }

  async price(symbol) {
    return +(await this.publicGet("/api/v3/ticker/price", { symbol })).price;
  }

  async symbolInfo(symbol) {
    if (this.filters[symbol]) return this.filters[symbol];
    const info = await this.publicGet("/api/v3/exchangeInfo", { symbol });
    const s = info.symbols[0];
    const lot = s.filters.find((f) => f.filterType === "LOT_SIZE");
    const notional = s.filters.find((f) => f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL");
    this.filters[symbol] = {
      base: s.baseAsset, quote: s.quoteAsset,
      stepSize: +lot.stepSize, minQty: +lot.minQty,
      minNotional: +(notional?.minNotional ?? 5),
    };
    return this.filters[symbol];
  }

  async balance(asset) {
    const acc = await this.signed("GET", "/api/v3/account", { omitZeroBalances: "true" });
    const b = acc.balances.find((x) => x.asset === asset);
    return b ? +b.free : 0;
  }

  // Achat au marché pour un montant en USDT (quoteOrderQty)
  async marketBuy(symbol, quoteAmount) {
    const o = await this.signed("POST", "/api/v3/order", {
      symbol, side: "BUY", type: "MARKET", quoteOrderQty: quoteAmount.toFixed(2), newOrderRespType: "FULL",
    });
    return summarizeFill(o);
  }

  // Vente au marché d'une quantité de l'actif
  async marketSell(symbol, qty) {
    const { stepSize } = await this.symbolInfo(symbol);
    const o = await this.signed("POST", "/api/v3/order", {
      symbol, side: "SELL", type: "MARKET", quantity: roundStep(qty, stepSize), newOrderRespType: "FULL",
    });
    return summarizeFill(o);
  }
}

export function roundStep(qty, step) {
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  return (Math.floor(qty / step) * step).toFixed(decimals);
}

function summarizeFill(o) {
  const qty = +o.executedQty;
  const quote = +o.cummulativeQuoteQty;
  // Frais prélevés dans l'actif reçu (si payés en BNB, ils ne réduisent pas la quantité)
  const feeInBase = (o.fills || []).filter((f) => f.commissionAsset && o.symbol.startsWith(f.commissionAsset))
    .reduce((s, f) => s + +f.commission, 0);
  return { orderId: o.orderId, status: o.status, qty, quote, avgPrice: qty ? quote / qty : 0, feeInBase };
}
