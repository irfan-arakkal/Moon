# Test 1 — Screenpipe répond (health + recherche 24h)

## Contexte

Screenpipe avait été relancé hors de cette conversation avant sa reprise (le
process tourne de nouveau ; pipeline de capture redémarré depuis ~1 min au
moment du test, mais la base contient des données antérieures à la coupure).
Appel fait via le serveur MCP `screenpipe` déjà branché sur Claude Code (pas de
`curl` manuel sur `localhost:3030` — accès direct par les tools MCP).

## 1. `health-check`

- `status`: `degraded` (code 503), `message`: "all systems are functioning
  normally."
- Raison de la dégradation : `ui_recorder_not_running` (sévérité `warning`,
  capture UI configurée mais pas démarrée — permissions accessibilité à
  vérifier). N'affecte pas la capture écran/audio.
- `last_frame_timestamp`: 2026-10-17T19:21:02+02:00, `last_audio_timestamp`:
  2026-10-17T19:21:29+02:00 → capture active et récente.
- `frames_captured`: 6, `audio devices`: 2 actifs (Jabra Evolve2 30 SE, input
  + output), `pending_transcription_segments`: 13.
- `version`: 0.4.52, `monitors`: ["Display 33 (1920x1080)"].

**Verdict Test 1a (health) : OK**, avec un warning mineur (UI recorder) sans
impact sur écran/audio.

## 2. Recherche sur les 24 dernières heures

- Tool : `search-content`, `content_type=all`, `start_time=2026-10-16T17:21:23Z`,
  `end_time=2026-10-17T17:21:23Z` (UTC, calculé au moment du test), `limit=5`.
- Résultat : **191 matches** sur la fenêtre 24h (3 retournés, pagination
  disponible via `offset`).
- 3 résultats (app + horodatage) :
  1. `[Screen·ocr]` 2026-10-17T19:21:00+02:00 — fenêtre Claude Code (terminal),
     frame_id=146.
  2. `[Screen·ocr]` 2026-10-17T19:20:54+02:00 — terminal `hesposit@f1r7s16:~`,
     frame_id=145.
  3. `[Screen·ocr]` 2026-10-17T19:20:48+02:00 — fenêtre Claude Code, frame_id=144.
- Masquage : Screenpipe redacte déjà les adresses mail dans l'OCR (littéralement
  `[EMAIL]` dans le texte retourné) — aucune autre donnée sensible (mot de
  passe, token) repérée dans les 3 extraits. Un extrait montrait le prompt de
  cette même conversation (fenêtre Claude Code) — contenu non sensible, pas
  masqué davantage.

**Verdict Test 1b (recherche 24h) : OK**, 191 résultats dont 3 inspectés.

## Verdict global Test 1 : **OK**
