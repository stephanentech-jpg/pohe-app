# POHE Trader — agent de trading crypto (Binance)

Agent qui achète et vend **réellement** sur Binance Spot, avec retrait final en **FCFA** via le marché P2P de Binance.
La décision est prise soit par **Claude** (IA), soit par une règle simple (`sma`, `rsi`).

> ⚠️ **Argent réel.** Vous pouvez perdre la totalité du budget engagé. Aucun gain n'est garanti.
> Commencez avec un petit montant (10 000 FCFA) et `--max-orders 2`.

## 1. Préparer le compte Binance

1. Compte Binance vérifié (KYC).
2. **Déposer des FCFA** : *Acheter des cryptos → P2P*, devise **XOF**, achetez des **USDT**
   (paiement Orange Money, Wave, MTN MoMo… selon votre pays). Choisissez des vendeurs avec beaucoup
   d'ordres et un taux de réussite élevé. Ne payez jamais en dehors de la plateforme.
   Binance impose un minimum d'environ **5 USDT par ordre** (≈ 3 000 FCFA).
3. **Créer une clé API** : *Profil → Gestion des API → Créer* :
   - ✅ « Enable Reading » et « Enable Spot & Margin Trading »
   - ❌ **NE COCHEZ JAMAIS « Enable Withdrawals »** : même si la clé fuit, personne ne pourra retirer vos fonds.
   - Restreignez la clé à l'adresse IP de votre machine.

## 2. Installer (Node.js 18 ou plus)

```bash
cd trader
npm install
export BINANCE_API_KEY="votre_clé"
export BINANCE_API_SECRET="votre_secret"
export ANTHROPIC_API_KEY="votre_clé_anthropic"   # seulement pour la stratégie claude
```

Ne partagez jamais ces clés et ne les mettez jamais dans le code ou dans Git.

## 3. Lancer un ou deux tests réels

```bash
# Une seule décision immédiate de Claude, au plus 2 ordres, budget 10 000 FCFA
node src/live.js --pair BTCUSDT --strategy claude --budget 10000 --max-orders 2 --once

# Puis laisser l'agent surveiller la position (stop-loss, décision à chaque bougie de 1 h)
node src/live.js --pair BTCUSDT --strategy claude --budget 10000 --max-orders 2
```

Chaque ordre est affiché et doit être confirmé en tapant `oui` (sauf avec `--yes`).
Le **stop-loss** est appliqué sans confirmation pour protéger le capital. L'agent doit donc rester
allumé tant qu'une position est ouverte (vérification du prix chaque minute).

| Option | Rôle | Défaut |
|---|---|---|
| `--pair` | Paire Binance | `BTCUSDT` |
| `--strategy` | `claude`, `sma`, `rsi` | `claude` |
| `--interval` | Bougies : `15m`, `1h`, `4h`, `1d` | `1h` |
| `--budget` | Montant max engagé, en FCFA | `10000` |
| `--max-orders` | Nombre max d'ordres, puis arrêt | `2` |
| `--max-loss` | Perte max en FCFA, puis arrêt définitif | 30 % du budget |
| `--stop-loss` | Stop par défaut (0.05 = 5 %) | `0.05` |
| `--xof-rate` | Taux FCFA par USDT (pour l'affichage) | `600` |
| `--once` | Une décision puis arrêt | — |
| `--yes` | Pas de confirmation manuelle | — |
| `--testnet` | Réseau de test Binance (faux argent, clés de testnet.binance.vision) | — |
| `--reset` | Relancer après un arrêt automatique | — |

L'agent **ne vend que ce qu'il a acheté lui-même** (fichier `state-live-<PAIRE>.json`), jamais vos autres avoirs.
Toutes les décisions et tous les ordres sont dans `journal-live.jsonl`.

## 4. Récupérer ses FCFA

1. Vendez vos cryptos en USDT (ou laissez l'agent le faire).
2. *P2P → Vendre*, USDT → **XOF**, vers votre Mobile Money.
3. Ne libérez les USDT **qu'après avoir vu l'argent arriver** sur votre compte. C'est l'arnaque P2P la plus courante.

## Coûts à connaître

- Frais Binance : environ 0,1 % par ordre.
- Écart du taux P2P à l'achat et à la revente : souvent 1 à 3 %.
- IA : chaque décision de Claude coûte quelques centimes de dollar. Avec une décision par heure, cela peut
  représenter plusieurs centaines de FCFA par jour, ce qui est significatif sur un petit budget.
  Utilisez `--interval 4h` pour réduire ce coût.

## Outil complémentaire (facultatif)

`node src/backtest.js --strategy all --days 30` rejoue l'historique pour comparer les stratégies sans passer d'ordres.
