# Test 3 — MCP B minimal (hello), local puis Railway

## Stack réelle (vérifiée contre npm registry + types publiés, pas devinée)

- `@modelcontextprotocol/server@2.3.1` (ligne "v2" du SDK officiel TypeScript,
  distincte de `@modelcontextprotocol/sdk` v1) : `McpServer`, `registerTool`,
  `WebStandardStreamableHTTPServerTransport` (transport Web Standard
  Request/Response, Node 18+).
- `hono` + `@hono/node-server` pour exposer `/mcp` en HTTP, pattern Hono
  officiellement documenté (`app.all('/mcp', c => transport.handleRequest(c.req.raw))`).
- `zod@4.6.7` pour le schéma d'input de l'outil `hello`.

## Code

`spike/mcp-b/src/server.ts` — un seul outil `hello({ name?: string })`, mode
stateless (un `McpServer` + un `WebStandardStreamableHTTPServerTransport` par
requête). Vérification d'accès manuelle avant tout traitement MCP : comparaison
stricte de l'en-tête `Authorization: Bearer <MCP_ACCESS_KEY>` lu dans
`process.env`. 401 JSON sinon, sans jamais logguer la clé.

`.env` (non commité, dans `.gitignore`) : clé générée aléatoirement
(`crypto.randomBytes(24).toString('hex')`, 48 caractères hex), jamais affichée
dans aucune sortie de ce test.

## Résultats — local (port 8787)

- Requête POST `/mcp` sans en-tête `Authorization` → **401** `{"error":"unauthorized"}`.
- Requête POST `/mcp` avec `Authorization: Bearer wrong-key-123` → **401** idem.
- Requête `initialize` avec la vraie clé → **200**, SSE,
  `serverInfo: {name: "mcp-b-spike", version: "1.0.0"}`.
- `tools/list` avec la vraie clé → renvoie bien `hello` avec son schéma JSON.
- `tools/call hello {name: "Hugo"}` avec la vraie clé → `"Hello, Hugo — MCP B spike is alive."`.
- `claude mcp add --transport http mcp-b-local http://localhost:8787/mcp -H
  "Authorization: Bearer $MCP_ACCESS_KEY"` → accepté par Claude Code
  (`claude mcp get mcp-b-local` → Status: Connected). **Appel du tool depuis
  l'intérieur de Claude Code pas encore fait** : nécessite un redémarrage de
  session pour charger le nouveau MCP dans la liste d'outils (cf. message
  principal pour la commande exacte).

## Déploiement Railway

- CLI déjà authentifié sur cette machine (`railway whoami` → Hugo), aucune
  commande `railway login` nécessaire pour ce test.
- `railway init --name mcp-b-spike --json` → projet créé et lié
  (id `30d27d48-fecc-43a6-bd88-ce451288177f`).
- `railway up -y --json` depuis `spike/mcp-b/` → build Railpack/Nixpacks réussi,
  service `mcp-b-spike` créé automatiquement (pas de Dockerfile/config custom
  nécessaire : `npm start` détecté depuis `package.json`).
- **Premier déploiement en CRASH** (attendu, documenté dans le code lui-même) :
  `MCP_ACCESS_KEY is not set` — logs confirmés via `railway logs`. Diagnostic
  immédiat : variable d'environnement pas encore poussée côté Railway.
- `railway variable set "MCP_ACCESS_KEY=..." --service mcp-b-spike --json`
  (valeur lue depuis `.env` local, jamais retapée en clair dans une sortie) →
  redéploiement automatique déclenché, statut passé à **SUCCESS**.
- `railway domain --service mcp-b-spike --json` → URL publique :
  `https://mcp-b-spike-production.up.railway.app`.
- Mêmes tests qu'en local refaits sur l'URL publique : 401 sans clé, 401 avec
  mauvaise clé, 200 + réponse correcte de `hello` avec la vraie clé via
  `tools/call` en HTTPS.
- `claude mcp add --transport http mcp-b-railway https://mcp-b-spike-production.up.railway.app/mcp
  -H "Authorization: Bearer $MCP_ACCESS_KEY"` → accepté par Claude Code. Même
  limite que pour `mcp-b-local` : appel du tool **depuis l'intérieur de Claude
  Code** pas encore vérifié, en attente du redémarrage de session.

## Ce qui reste à faire après redémarrage de session

Depuis Claude Code (nouvelle session) : lister les tools réellement exposés par
`mcp-b-local` et `mcp-b-railway`, puis appeler `hello` sur les deux pour clore la
preuve "branché sur Claude Code" de bout en bout (pas seulement via `curl`).
