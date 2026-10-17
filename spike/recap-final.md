# Récap final — Spikes hackathon Screenpipe (Tests 1, 2, 3)

## Tableau récap

| Test | Verdict | Preuve courte | Blocage / prochaine action |
|---|---|---|---|
| **1 — Screenpipe répond** | **OK** | `health-check` : capture écran+audio active, derniers frame/audio il y a quelques secondes. `search-content` sur 24h : 191 résultats, 3 inspectés (fenêtres Claude Code / terminal), emails déjà masqués nativement (`[EMAIL]`). | Warning mineur `ui_recorder_not_running` (capture UI configurée mais pas démarrée) — sans impact sur écran/audio, pas bloquant pour P0. Aucune action requise sauf si la capture UI (clics/clavier) devient nécessaire plus tard. |
| **2 — MCP A sur Claude Code** | **OK (avec réserve)** | Serveur `screenpipe` déjà branché, 32 tools réels listés (bien plus riche que le `screenpipe-mcp` minimal supposé au plan). `activity-summary` sur les 10 dernières minutes a répondu (`data status: ok`). | Réserve : seulement 0,5 min de temps actif authentifié sur la fenêtre de 10 min, parce que le pipeline de capture avait été relancé ~1 min avant l'appel. Pas un échec de l'intégration — juste une fenêtre de test peu représentative. Prochaine fois : laisser tourner Screenpipe plusieurs minutes avant de tester l'activité récente. |
| **3 — MCP B distant minimal** | **OK** | `hello` répond en local (`mcp-b-local`) et sur Railway (`mcp-b-railway`) **depuis l'intérieur de Claude Code** : `"Hello, Hugo — MCP B spike is alive."` sur les deux. 401 prouvés sans clé / avec mauvaise clé (côté `curl`, test 3 initial). | Aucun. Preuve de bout en bout bouclée (local + distant + authentification). |

## Ce qui a été réellement testé vs pas testé

**Testé :**
- Screenpipe santé + recherche réelle sur 24h (§14.1 du CLAUDE.md).
- Claude (cette session) appelant MCP A et récupérant des résultats réels, y compris un résumé d'activité sur une fenêtre courte (§14.2, H1).
- Un MCP distant minimal (`hello`) branché sur Claude depuis Railway, avec clé d'accès, appelé réellement depuis Claude Code — pas seulement en `curl` (§14.3, H3).

**Pas testé (donc pas encore prouvé) :**
- L'étape d'**analyse** (§7) : transformer des observations Screenpipe brutes en « processus candidat » structuré (titre, étapes, observé/inféré). On a lu des données, pas produit d'analyse.
- Les **tools métier de MCP B** (§6 : `create_workflow`, `add_node`, `update_node`, `connect_nodes`, etc. / tâche H4) — le MCP B actuel n'expose que `hello`, aucun tool de création/modification de workflow.
- L'**affichage du graphe** côté interface (§9, dépend du dépôt/API/front d'Irfan — I1 à I6, pas commencées à notre connaissance).
- La **boucle P0 complète de bout en bout** (H5) : Screenpipe → analyse → création via MCP B → graphe affiché. Aucun maillon d'écriture (MCP B métier) ni d'affichage n'existe encore pour l'enchaîner.

## Avis motivé sur la faisabilité de la boucle P0

Les deux maillons d'infrastructure qui présentaient le plus de risque technique a
priori — la connectivité réelle à Screenpipe via MCP, et un MCP distant
authentifié fonctionnel sur Railway — sont maintenant **prouvés et fiables**.
Ce n'était pas garanti au départ (bun cassé, MCP A à reconfigurer, Railway pas
encore lié), et c'est désormais réglé : pas de surprise attendue sur ce plan
d'ici la démo.

Le risque restant sur la boucle P0 n'est plus technique au sens "est-ce que
les MCP marchent", mais porte sur deux points non encore adressés :

1. **Le MCP B métier n'existe pas encore** (seulement un `hello` de preuve de
   concept) — il reste à écrire les tools réels de §6 (H4), ce qui est un
   développement complet, pas un test de connectivité.
2. **L'étape d'analyse** (§7) n'a jamais été exercée : on ne sait pas encore
   si, à partir d'observations Screenpipe réelles et limitées en volume
   (ex. 0,5 min actif sur une fenêtre de 10 min quand la capture vient de
   redémarrer), Claude peut produire un processus candidat convaincant sans
   sur-inférer. C'est le cœur de la valeur démo (§17) et le point le moins
   vérifié des trois.

Mon avis : la boucle P0 est **faisable dans le temps restant**, mais le point
dur n'est plus "est-ce que Screenpipe/MCP répondent" (réglé) — c'est
d'enchaîner H4 (tools métier MCP B, qui dépend du contrat `shared/types.ts`
d'Irfan) puis H5 (boucle complète) sans attendre que Screenpipe ait accumulé
assez d'activité capturée pour une analyse crédible. Recommandation concrète :
lancer dès maintenant une session Screenpipe longue (10-15 min minimum,
idéalement le scénario comptable de §10/H2) en parallèle du développement de
MCP B, pour avoir des données d'analyse exploitables au moment où H5 démarre,
plutôt que de tester l'analyse sur une fenêtre de capture fraîchement
relancée comme dans ce Test 2.
