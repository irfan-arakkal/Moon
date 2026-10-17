---
description: Plan B — analyse une session Screenpipe enregistrée (fixtures/) et crée le workflow dans Moon
argument-hint: [fichier fixtures/session-….json]  (défaut : le plus récent)
---

Plan B (CLAUDE.md §11) : Screenpipe n'est pas utilisable en direct, on rejoue une
session **réellement capturée** et figée plus tôt par `/analyse`. Fichier : $ARGUMENTS
(si vide, le plus récent de `fixtures/`). S'il n'existe aucun fichier, dis-le et arrête-toi :
ne fabrique jamais d'observations.

1. Lis le fichier. Dis clairement à l'utilisateur : « session enregistrée Screenpipe du
   <capturedAt>, rejouée — pas une lecture en direct ».
2. N'appelle pas `report_screenpipe_status` avec `connected` (Screenpipe n'a pas été
   interrogé maintenant).
3. Suis les étapes 3 et 4 de `.claude/commands/analyse.md`, avec **une seule différence** :
   `create_workflow` avec `sourceMode: "screenpipe_recorded"` (l'interface affichera
   « Session enregistrée Screenpipe »). Mets dans les incertitudes que la session est rejouée.
