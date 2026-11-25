#!/usr/bin/env node
// Agent de trading RÉEL sur Binance Spot.
//
//   node src/live.js --pair BTCUSDT --strategy claude --budget 10000 --max-orders 2 --once
//
// Sécurités :
//   --budget       montant maximum engagé par l'agent, en FCFA (défaut 10 000)
//   --max-orders   nombre maximum d'ordres avant arrêt (défaut 2)
//   --max-loss     perte maximale en FCFA avant arrêt définitif (défaut 30 % du budget)
//   --stop-loss    stop-loss par défaut sous le prix d'entrée (défaut 0.05 = 5 %)
//   confirmation   chaque ordre est confirmé au clavier, sauf avec --yes
//   --testnet      même code, sur le réseau de test de Binance (faux argent)
// L'agent ne vend QUE ce qu'il a lui-même acheté (fichier d'état), jamais vos autres avoirs.

import fs from "node:fs";
import readline from "node:readline/promises";
import { Binance } from "./binance.js";
import { computeAll } from "./indicators.js";
import { strategies } from "./strategies.js";
import { parseArgs, fmtXOF, fmtPct } from "./args.js";

const a = parseArgs();
const pair = (a.pair || "BTCUSDT").toUpperCase();
const interval = a.interval || "1h";
const strategyName = a.strategy || "claude";
const xofPerUsdt = +(a["xof-rate"] || 600);
const budgetXOF = +(a.budget || 10000);
const maxOrders = +(a["max-orders"] || 2);
const maxLossXOF = +(a["max-loss"] || budgetXOF * 0.3);
const defaultStop = +(a["stop-loss"] || 0.05);
const testnet = !!a.testnet;
const STATE_FILE = a.state || `state-${testnet ? "testnet" : "live"}-${pair}.json`;
const LOG_FILE = a.log || `journal-${testnet ? "testnet" : "live"}.jsonl`;
const POLL_MS = 60_000;

const ex = new Binance({ testnet });

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
  catch { return { qty: 0, entryPrice: null, stopPrice: null, invested: 0, realizedPnl: 0, orders: 0, lastCandle: null, halted: false }; }
}
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
const log = (entry) => fs.appendFileSync(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), pair, ...entry }) + "\n");
const say = (msg) => console.log(`[${new Date().toLocaleTimeString("fr-FR")}] ${msg}`);

async function confirm(question) {
  if (a.yes) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = (await rl.question(`${question} Tapez « oui » pour confirmer : `)).trim().toLowerCase();
  rl.close();
  return ans === "oui";
}

async function getDecider() {
  if (strategyName === "claude") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY doit être défini pour la stratégie claude.");
    const { ClaudeTrader } = await import("./agent.js");
    const t = new ClaudeTrader({ model: a.model, effort: a.effort });
    return (...args) => t.decide(...args);
  }
  if (!strategies[strategyName]) throw new Error(`Stratégie inconnue : ${strategyName} (claude, sma, rsi)`);
  return async (...args) => strategies[strategyName](...args);
}

async function buy(state, price, d) {
  const info = await ex.symbolInfo(pair);
  const budgetUsdt = budgetXOF / xofPerUsdt;
  const room = budgetUsdt - state.invested;
  const amount = Math.min(room, budgetUsdt * (d.fraction ?? 1));
  if (amount < info.minNotional) return say(`Achat ignoré : montant ${amount.toFixed(2)} USDT sous le minimum Binance (${info.minNotional} USDT ≈ ${fmtXOF(info.minNotional * xofPerUsdt)}). Augmentez --budget.`);
  const free = await ex.balance(info.quote);
  if (free < amount) return say(`Achat ignoré : solde ${info.quote} insuffisant (${free.toFixed(2)} disponible, ${amount.toFixed(2)} requis).`);
  if (!(await confirm(`ACHAT ${pair} pour ${amount.toFixed(2)} ${info.quote} (≈ ${fmtXOF(amount * xofPerUsdt)}) au prix ≈ ${price}. Raison : ${d.reason}.`))) return say("Achat annulé.");

  const fill = await ex.marketBuy(pair, amount);
  const got = fill.qty - fill.feeInBase;
  state.entryPrice = state.qty > 0 ? (state.entryPrice * state.qty + fill.avgPrice * got) / (state.qty + got) : fill.avgPrice;
  state.qty += got;
  state.invested += fill.quote;
  state.stopPrice = state.entryPrice * (1 - (d.stopLossPct ?? defaultStop));
  state.orders++;
  saveState(state);
  log({ side: "BUY", ...fill, reason: d.reason });
  say(`✅ ACHAT exécuté : ${got} ${info.base} à ${fill.avgPrice.toFixed(2)} (${fmtXOF(fill.quote * xofPerUsdt)}). Stop à ${state.stopPrice.toFixed(2)}.`);
}

async function sell(state, price, reason, force = false) {
  if (state.qty <= 0) return;
  const info = await ex.symbolInfo(pair);
  const qty = Math.min(state.qty, await ex.balance(info.base));
  if (qty * price < info.minNotional) return say(`Vente impossible : position trop petite pour Binance (${(qty * price).toFixed(2)} USDT).`);
  if (!force && !(await confirm(`VENTE de ${qty} ${info.base} au prix ≈ ${price}. Raison : ${reason}.`))) return say("Vente annulée.");

  const fill = await ex.marketSell(pair, qty);
  const pnl = fill.quote - state.entryPrice * fill.qty;
  state.realizedPnl += pnl;
  state.qty = Math.max(0, state.qty - fill.qty);
  if (state.qty * price < info.minNotional) { state.qty = 0; state.entryPrice = null; state.stopPrice = null; state.invested = 0; }
  state.orders++;
  saveState(state);
  log({ side: "SELL", ...fill, pnl, reason });
  say(`✅ VENTE exécutée : ${fill.qty} ${info.base} à ${fill.avgPrice.toFixed(2)}. Résultat : ${fmtXOF(pnl * xofPerUsdt)} (cumul ${fmtXOF(state.realizedPnl * xofPerUsdt)}).`);
}

function haltIfNeeded(state, price) {
  const unrealized = state.qty > 0 ? (price - state.entryPrice) * state.qty : 0;
  const totalXOF = (state.realizedPnl + unrealized) * xofPerUsdt;
  if (totalXOF <= -maxLossXOF) { state.halted = `perte de ${fmtXOF(-totalXOF)} ≥ limite ${fmtXOF(maxLossXOF)}`; saveState(state); }
  else if (state.orders >= maxOrders && state.qty === 0) { state.halted = `${state.orders} ordres passés (limite --max-orders ${maxOrders})`; saveState(state); }
  return state.halted;
}

async function cycle(state, decide) {
  const price = await ex.price(pair);

  // 1. Stop-loss : vente immédiate, sans demander, pour protéger le capital.
  if (state.qty > 0 && price <= state.stopPrice) {
    say(`🛑 Stop-loss touché (${price} ≤ ${state.stopPrice.toFixed(2)}).`);
    await sell(state, price, "stop-loss", true);
  }

  // 2. Nouvelle décision à chaque bougie clôturée.
  const all = await ex.candles(pair, interval, 120);
  const candles = all.filter((c) => c.closeTime < Date.now());
  const last = candles[candles.length - 1];
  if (state.lastCandle !== last.time) {
    state.lastCandle = last.time;
    saveState(state);
    const ind = computeAll(candles);
    const i = candles.length - 1;
    const budgetUsdt = budgetXOF / xofPerUsdt;
    const pos = {
      inPosition: state.qty > 0,
      exposurePct: state.qty > 0 ? Math.min(1, (state.qty * price) / budgetUsdt) : 0,
      entryPrice: state.entryPrice, stopPrice: state.stopPrice,
      unrealizedPct: state.qty > 0 ? price / state.entryPrice - 1 : 0,
      totalReturnPct: (state.realizedPnl + (state.qty > 0 ? (price - state.entryPrice) * state.qty : 0)) / budgetUsdt,
    };
    const d = await decide(i, candles, ind, pos);
    say(`Décision ${strategyName} : ${d.action}${d.reason ? " — " + d.reason : ""}`);
    log({ side: "DECISION", action: d.action, reason: d.reason, price });

    if (state.orders >= maxOrders) say(`Limite de ${maxOrders} ordres atteinte : aucun nouvel ordre (le stop-loss reste actif).`);
    else if (d.action === "BUY") await buy(state, price, d);
    else if (d.action === "SELL") await sell(state, price, d.reason);
  }

  const unreal = state.qty > 0 ? (price / state.entryPrice - 1) : 0;
  say(`Prix ${price} | Position ${state.qty || 0} ${state.qty > 0 ? `(${fmtPct(unreal)})` : ""} | Résultat réalisé ${fmtXOF(state.realizedPnl * xofPerUsdt)}`);
}

async function main() {
  ex.requireKeys();
  const state = loadState();
  if (state.halted && !a.reset) throw new Error(`Agent arrêté : ${state.halted}. Relancez avec --reset après vérification.`);
  if (a.reset) { state.halted = false; state.orders = 0; saveState(state); }

  const info = await ex.symbolInfo(pair);
  const quoteBal = await ex.balance(info.quote);
  console.log(`\n=== Agent de trading ${testnet ? "TESTNET (faux argent)" : "RÉEL — ARGENT RÉEL"} ===`);
  console.log(`Paire ${pair} | Stratégie ${strategyName} | Budget ${fmtXOF(budgetXOF)} | Max ${maxOrders} ordres | Perte max ${fmtXOF(maxLossXOF)}`);
  console.log(`Solde disponible : ${quoteBal.toFixed(2)} ${info.quote} (≈ ${fmtXOF(quoteBal * xofPerUsdt)})\n`);
  if (!testnet && !(await confirm("Vous allez trader avec de l'argent RÉEL."))) return say("Arrêt.");

  const decide = await getDecider();
  // Avec --once : une seule décision immédiate, puis arrêt.
  if (a.once) state.lastCandle = null;

  while (true) {
    try {
      await cycle(state, decide);
    } catch (e) {
      say(`⚠️  Erreur : ${e.message}`);
      log({ side: "ERROR", message: e.message });
    }
    if (haltIfNeeded(state, await ex.price(pair).catch(() => state.entryPrice ?? 0))) return say(`Arrêt définitif : ${state.halted}.`);
    if (a.once) return say(state.qty > 0 ? "Fin (--once). Position ouverte : relancez sans --once pour que l'agent la surveille et applique le stop-loss." : "Fin (--once).");
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => { console.error("Erreur :", e.message); process.exit(1); });
