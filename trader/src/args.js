// Lecture simple des options en ligne de commande : --cle valeur ou --drapeau
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

export const fmtXOF = (v) => `${Math.round(v).toLocaleString("fr-FR")} FCFA`;
export const fmtPct = (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)} %`;
