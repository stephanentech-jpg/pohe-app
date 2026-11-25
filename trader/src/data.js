// Données de marché : bougies (OHLCV) publiques de Binance, ou données synthétiques hors-ligne.
// Aucune clé API n'est nécessaire pour lire les prix publics.

const BASE = "https://data-api.binance.vision/api/v3/klines";
const INTERVAL_MS = { "15m": 9e5, "1h": 36e5, "4h": 144e5, "1d": 864e5 };

export async function fetchCandles(pair, interval, days) {
  const step = INTERVAL_MS[interval];
  if (!step) throw new Error(`Intervalle non supporté : ${interval} (choix : ${Object.keys(INTERVAL_MS).join(", ")})`);
  const end = Date.now();
  let start = end - days * 864e5;
  const out = [];
  while (start < end) {
    const url = `${BASE}?symbol=${pair}&interval=${interval}&startTime=${start}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance a répondu ${res.status} pour ${pair}`);
    const rows = await res.json();
    if (!rows.length) break;
    for (const r of rows) {
      out.push({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] });
    }
    start = rows[rows.length - 1][0] + step;
  }
  return out;
}

// Marche aléatoire avec tendance et volatilité changeantes, pour tester sans Internet.
export function syntheticCandles(n = 720, seed = 42, startPrice = 60000) {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const out = [];
  let price = startPrice, drift = 0;
  const t0 = Date.now() - n * 36e5;
  for (let i = 0; i < n; i++) {
    if (i % 120 === 0) drift = (rand() - 0.5) * 0.004; // nouveau régime de marché
    const open = price;
    const close = open * (1 + drift + gauss() * 0.008);
    const high = Math.max(open, close) * (1 + rand() * 0.004);
    const low = Math.min(open, close) * (1 - rand() * 0.004);
    out.push({ time: t0 + i * 36e5, open, high, low, close, volume: 100 + rand() * 50 });
    price = close;
  }
  return out;
}
