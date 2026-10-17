# Démo Moon — déploiement, branchement, déroulé

Branche de travail : `claude/stoic-tesla-btxrt1` (contient API + interface + MCP B).

## 1. Railway (Hugo) — deux services, même dépôt, même branche

Générer deux clés (`openssl rand -hex 32` ×2) : **K1** = clé API, **K2** = clé MCP.
Ne jamais les mettre dans le dépôt, un chat de groupe ou un log.

| Service | Config file | Variables | Autre |
|---|---|---|---|
| **app** (API + interface) | `railway.json` (racine, par défaut) | `API_KEY=K1`, `DATABASE_PATH=/data/moon.db`, `SEED_TEST_DATA=false` | Volume monté sur `/data`, Generate Domain |
| **mcp** (MCP B) | `mcp/railway.json` | `MCP_ACCESS_KEY=K2`, `MOON_API_KEY=K1`, `MOON_API_URL=https://<domaine-app>/api` | Generate Domain |

Vérifier : `https://<domaine-app>/api/health` → `{"ok":true}` ;
`https://<domaine-mcp>/health` → 11 outils ; l'interface affiche ces outils dans
« Outils MCP disponibles » (redémarrer le service mcp si l'app a démarré après lui).

## 2. Brancher Claude Code (sur la machine qui fait tourner Screenpipe)

```bash
claude mcp add --transport http moon https://<domaine-mcp>/mcp -H "Authorization: Bearer K2"
claude mcp list        # screenpipe (MCP A) et moon (MCP B) doivent apparaître
```

Lancer Claude Code **à la racine du dépôt** pour avoir les commandes `/analyse` et
`/analyse-enregistree` (`.claude/commands/`).

## 3. Enregistrer le scénario (H2) — documents prêts dans `docs/scenario/`

Screenpipe tourne depuis quelques minutes (sinon peu de temps actif capturé).
Noter l'heure de début et de fin. Données **fictives**, jouées lentement, 3 à 5 min :
1. Mail client avec une facture fournisseur PDF.
2. Ouvrir le PDF : montant, date, fournisseur.
3. Recopier dans un tableur.
4. Vérifier le paiement dans un relevé bancaire fictif.
5. Envoyer un mail de relance pour pièce manquante.

## 4. Boucle P0 (H5)

Dans Claude Code : `/analyse 21:10 21:15` (heures du scénario).
Claude : health-check Screenpipe → statut dans la sidebar → observations affichées →
processus candidat (observé / inféré) → appels MCP B → graphe dans l'interface.
Les observations sont aussi figées dans `fixtures/session-*.json` (plan B).

Modification (H6) : « supprime l'étape de relance » / « renomme l'étape 3 en … ».

## 5. Plan B (H7)

Si Screenpipe ne répond pas le jour J : `/analyse-enregistree` rejoue le dernier fichier
de `fixtures/` → badge « Session enregistrée Screenpipe ». Le dire à l'oral.
Avant la démo, supprimer les workflows de répétition n'est pas possible depuis l'UI :
repartir d'un volume vide ou nommer clairement le workflow de démo.

## 6. Déroulé devant le jury (3–5 min)

1. Screenpipe tourne (montrer le statut). « La capture est réelle, les données du scénario sont fictives. »
2. `/analyse …` dans Claude Code : on voit l'appel réel à Screenpipe et les observations (app, heure).
3. Résumé de Claude : processus candidat, étapes observées vs inférées, incertitudes.
4. Côté Moon : le fil d'activité se remplit, le graphe apparaît ; clic sur une étape → provenance.
5. Modification en langage naturel → `update_node` / `remove_node` → le graphe change.
6. Limites dites honnêtement : analyse déclenchée à la main, période courte, pas d'exécution du workflow.
