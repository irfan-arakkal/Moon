# web/ — API REST + interface (Irfan)

## Lancer en local

```bash
npm install          # à la racine du dépôt
cp .env.example .env # facultatif : lu automatiquement par l’API et MCP B en local
npm run dev          # API sur :3000 + interface sur http://localhost:5173
npm test             # tests de l'API
npm run typecheck
```

Production (ce que fait Railway) : `npm run build` puis `npm start` (API + interface sur `$PORT`).

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `API_KEY` | **Obligatoire en production.** Clé exigée sur toutes les routes d'écriture (`Authorization: Bearer <API_KEY>`). Partagée avec MCP B. |
| `DATABASE_PATH` | Fichier SQLite. Sur Railway : monter un volume sur `/data` et mettre `/data/moon.db`, sinon la base est perdue à chaque déploiement. |
| `SEED_TEST_DATA` | `false` pour ne pas insérer le workflow de test dans une base vide. |
| `PORT` | Fourni par Railway. |
| `ANTHROPIC_API_KEY` | Facultatif. Active le panneau « Claude » (Sonnet 5.5) : questions générales, recherche web avec sources, et modification du workflow avec les mêmes outils que MCP B. Sans clé : zone de saisie désactivée, avec la raison. |
| `ASSISTANT_ACCESS_CODE` | Obligatoire en production si l’assistant est activé : code demandé une fois dans le panneau. |

## Déployer sur Railway (I4)

1. New Project → Deploy from GitHub repo → `irfan-arakkal/moon` (racine du dépôt ; `railway.json` donne les commandes).
2. Variables : `API_KEY` (générer une valeur longue, p. ex. `openssl rand -hex 32`), `DATABASE_PATH=/data/moon.db`.
3. Ajouter un volume monté sur `/data`.
4. Settings → Networking → Generate Domain. Vérifier `https://<domaine>/api/health` → `{"ok":true}`.
5. Envoyer l'URL à Hugo, et la clé **par un canal privé** (jamais dans le dépôt ni dans un chat de groupe).

## Contrat pour MCP B (Hugo)

Types : `shared/types.ts` et `shared/api.ts`. Toutes les routes sont sous `/api`.

**Écriture** : en-tête `Authorization: Bearer <API_KEY>` obligatoire.
Ajouter `X-MCP-Tool: <nom de l'outil>` : l'appel est alors enregistré dans le fil d'activité
(succès ou erreur réelle), affiché en direct dans l'interface.

| Outil MCP | Route |
|---|---|
| `create_workflow` | `POST /workflows` `{ clientId, name, description?, sourceMode, status?, uncertainties? }` |
| `get_workflow` | `GET /workflows/:id` (+ `POST /activity` pour le journaliser) |
| `add_node` | `POST /workflows/:id/nodes` `{ id?, type, title, description?, app?, origin, observations?, position?, clientId? }` |
| `update_node` | `PATCH /workflows/:id/nodes/:nodeId` (mêmes champs, tous facultatifs) |
| `remove_node` | `DELETE /workflows/:id/nodes/:nodeId` (supprime aussi ses connexions) |
| `connect_nodes` | `POST /workflows/:id/edges` `{ source, target, label?, clientId? }` |
| `validate_workflow` | `GET /workflows/:id/validate` → `{ valid, errors[] }` |
| — | `PATCH /workflows/:id` `{ status: 'analyzing' \| 'ready' \| 'error', uncertainties? }` |
| — | `POST /clients` `{ name }` |
| — | `POST /clients/:id/screenpipe-status` `{ status: 'connected' \| 'disconnected', lastSeenAt? }` |
| — | `DELETE /workflows/:id/edges/:edgeId` |
| — | `POST /activity` `{ workflowId?, tool, summary, status }` (outils sans route d'écriture) |
| — | `PUT /mcp/tools` `{ tools: [{ name, description }] }` — à appeler au démarrage de MCP B : alimente le bloc « Outils MCP disponibles » |

Si `clientId` est fourni sur une mutation, l'API vérifie que le workflow appartient à ce client (409 sinon).

Valeurs : `sourceMode` = `screenpipe_live` | `screenpipe_recorded` | `manual` ;
`type` = `trigger` | `action` | `condition` | `end` ; `origin` = `observed` | `inferred` ;
observation = `{ text, app, timestamp (ISO), windowName? }`. Une étape `observed` doit avoir au moins une observation (signalé par `validate`).

Les positions sont facultatives : sans `position`, l'interface calcule la disposition à partir des connexions.

## Honnêteté de l'interface

- Badge de source : « Workflow généré par l'IA · Basé sur l'activité réelle du client » uniquement si `sourceMode = screenpipe_live` ; « Session enregistrée Screenpipe » ; « Données d'exemple » ; et « Données de test » pour le workflow inséré par l'application.
- Statut Screenpipe : soit le navigateur joint réellement `http://localhost:3030/health` (page ouverte sur la machine qui capture), soit le dernier statut signalé via `POST /clients/:id/screenpipe-status` (moins de 10 min). Sinon « non connecté ».
  Le schéma exact de `/health` n'est pas vérifié : seul `last_frame_timestamp` est lu, s'il existe.
- Le fil d'activité ne montre que des appels réellement reçus avec `X-MCP-Tool`.
- Pas de bouton « Exporter » ni « Ajouter » tant qu'ils ne font rien ; l'onglet « Historique » est désactivé.
