---
description: Analyse une période Screenpipe (live) et crée le workflow dans Moon via MCP B
argument-hint: <début> <fin>  (ex. 21:10 21:15, heure locale)
---

Tu es l'agent de la démo Moon (CLAUDE.md §3, §7, §2). Période demandée : $ARGUMENTS
(si vide, demande la période avant de commencer).

Deux serveurs MCP : **screenpipe** (lecture de l'activité, MCP A) et **moon** (écriture
du workflow, MCP B). Ne les confonds pas. N'invente aucun outil : utilise ceux que tu vois.

## 1. Screenpipe réellement joignable
- Appelle `health-check` (screenpipe). Puis `list_clients` (moon) ; s'il n'y a aucun client,
  `create_client` avec le nom donné par l'utilisateur (sinon « Cabinet démo »).
- `report_screenpipe_status` (moon) avec le résultat RÉEL : `connected` + l'heure de la
  dernière capture renvoyée, ou `disconnected`. Si Screenpipe ne répond pas : arrête-toi
  et propose `/analyse-enregistree`.

## 2. Récupérer les observations (période courte uniquement)
- `activity-summary` sur la période, puis `search-content` sur la même période
  (limite raisonnable, ~50 résultats). Convertis l'heure locale en ISO UTC.
- Garde pour chaque observation : horodatage, application, fenêtre, texte **raccourci**.
  N'inclus jamais mots de passe, tokens, IBAN/numéros de carte, contenus privés inutiles.
- **Plan B automatique** : écris ces observations (déjà raccourcies) dans
  `fixtures/session-<AAAA-MM-JJ-HHMM>.json` au format
  `{ "capturedAt", "period": {"start","end"}, "source": "screenpipe", "observations": [{ "timestamp", "app", "windowName", "text" }] }`.

## 3. Montrer et analyser
- Affiche les observations groupées chronologiquement (heure · app · extrait).
- Propose UN processus candidat : titre, objectif, étapes, relations, conditions,
  incertitudes. Pour chaque étape : **observée** (au moins une observation la montre)
  ou **inférée** (déduite par toi). Ne qualifie jamais d'observée une étape inférée.
  N'affirme rien que les données ne montrent pas ; si elles montrent autre chose que le
  scénario comptable prévu, décris ce qu'elles montrent.

## 4. Créer le workflow dans Moon
1. `create_workflow` avec `sourceMode: "screenpipe_live"` (tu as réellement lu Screenpipe
   dans cette session), `status: "analyzing"`, description = objectif.
2. `add_node` pour chaque étape (`id` courts : s1, s2…; `type` trigger/action/condition/end ;
   `app` ; `origin` ; `observations` = celles qui la prouvent, pour les étapes observées).
3. `connect_nodes` dans l'ordre ; étiquettes `true` / `false` en sortie d'une condition.
4. `validate_workflow` ; corrige les erreurs signalées.
5. `set_workflow_status` → `ready` avec la liste des incertitudes.

Termine par un résumé court : nombre d'observations utilisées, étapes observées vs
inférées, incertitudes, et ce qu'on doit voir maintenant dans l'interface Moon.
Un appel n'est « réussi » que si l'outil a renvoyé un succès.
