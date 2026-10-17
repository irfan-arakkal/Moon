# Test 2 — MCP A (Screenpipe) sur Claude Code

## Écart avec le plan initial

Le plan supposait un MCP minimal façon `npx -y screenpipe-mcp` avec 2-3 tools
(health + search). En réalité, à la reprise, le serveur MCP `screenpipe` était
déjà proprement branché sur Claude Code et expose **beaucoup plus de tools**
que prévu (liste réelle ci-dessous, pas supposée) — pas de
`claude mcp remove`/`claude mcp add` nécessaire, le point de blocage identifié
dans le plan (bun cassé) ne s'est pas reproduit.

## 1. Liste réelle des tools exposés par le serveur `screenpipe`

`activity-summary`, `add-tags`, `control-recording`, `create-pipe`,
`export-video`, `frame-context`, `get-feedback`, `get-frame-elements`,
`get-meeting`, `get-workflow`, `health-check`, `keyword-search`,
`list-audio-devices`, `list-meetings`, `list-monitors`, `list-pipes`,
`list-unnamed-speakers`, `list-workflows`, `merge-speakers`, `pipe-logs`,
`run-pipe`, `screenpipe-skills`, `search-content`, `search-elements`,
`search-speakers`, `search-synced-content`, `send-notification`,
`start-meeting`, `stop-meeting`, `synced-devices`, `update-memory`,
`update-meeting`, `update-speaker` (32 tools).

## 2. Activité des 10 dernières minutes

- Tool : `activity-summary`, `start_time=2026-10-17T17:11:23Z`,
  `end_time=2026-10-17T17:21:23Z` (UTC).

**Observé (dans les résultats du tool) :**
- `Authoritative active time`: 0.5 min sur la fenêtre de 10 min.
- `Capture observations`: 6 frames (volume de capture, pas une durée).
- Aucune app/fenêtre listée, aucun segment audio, aucun intervalle starred,
  aucune mémoire dans la fenêtre.
- `Data status: ok`, `Recent capture: yes`.

**Déduit (par moi, pas dans les résultats) :**
- Le faible temps actif (0,5 min sur 10) colle avec le fait que le pipeline de
  capture venait d'être relancé il y a ~1 min au moment de l'appel
  (`health-check` → `pipeline.uptime_secs` ≈ 58 s) : la majorité de la fenêtre
  de 10 min s'est déroulée *avant* le redémarrage effectif de la capture, donc
  sans frames à sommer dessus.
- Aucun contenu sensible à masquer : le tool ne renvoie ici aucun texte brut
  (pas d'app, pas de transcript) sur cette fenêtre précise.

## Verdict global Test 2 : **OK** (tools listés et appelés avec succès), avec
la réserve ci-dessus sur la faible couverture temporelle due au redémarrage
récent de la capture.
