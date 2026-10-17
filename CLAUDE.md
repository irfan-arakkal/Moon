# CLAUDE.md — MVP hackathon Screenpipe

> **Priorité absolue : démontrer une boucle réelle
> Screenpipe MCP → Claude (agent) → workflow créé dans notre application
> via notre propre MCP, avec les deux intégrations clairement séparées.**

Équipe : Hugo et Irfan. Hackathon de 48 h, 42 Entrepreneurs, École 42 Paris.
Track : **Find What to Automate**.
Référence : https://42entrepreneurs.com/hackathon-screenpipe?tab=prizes#track-discover

---

## 1. Vision

Les freelances, agences d'automatisation et cabinets comptables perdent du
temps à auditer leurs clients pour savoir ce qui mérite d'être automatisé.

Avec le consentement du client, Screenpipe capture et indexe son activité
informatique. Claude analyse des observations réelles, repère un processus
candidat et le transforme en workflow visuel structuré dans notre interface.

Contexte fondateur : Hugo développe une startup d'identification des
automatisations possibles dans les cabinets comptables. Le scénario de démo
s'inspire de ce cas d'usage.

**Preuve centrale : données Screenpipe réelles → analyse de Claude →
workflow réellement généré et affiché, avec provenance.**

## 2. Règles d'honnêteté (valables partout)

- Ne jamais substituer silencieusement des données statiques à la boucle réelle.
  Tout ce qui est simulé est dit explicitement, dans l'UI comme à l'oral.
- Ne pas présenter des données synthétiques comme provenant de Screenpipe.
  Si on joue un scénario avec des données fictives, la capture est réelle, les
  données jouées sont fictives, et on l'indique.
- Distinguer **observé** (présent dans les résultats Screenpipe) et **inféré**
  (déduit par le modèle). Ne jamais appeler « observée » une étape inférée.
- Ne pas affirmer que l'analyse est continue si elle est déclenchée manuellement.
- Ne pas affirmer qu'un MCP fonctionne avant de l'avoir testé.
- Une opération n'est « réussie » qu'après un retour de succès réel.
- Ne pas inventer d'API ou d'outils Screenpipe/MCP : vérifier les contrats réels.

## 3. Architecture

**L'agent est Claude (Claude Desktop ou Claude Code), pas un chat intégré à
notre app.** Il est connecté à deux serveurs MCP distincts :

| | MCP A — Screenpipe | MCP B — Notre application |
|---|---|---|
| Rôle | Lire l'activité capturée | Créer et modifier le workflow |
| Où | Local, sur le PC capturé | Distant, hébergé sur Railway |
| Transport | stdio (`npx -y screenpipe-mcp`) → API locale `localhost:3030` | HTTP (MCP Streamable HTTP) avec clé d'accès |

Flux :
1. Claude interroge Screenpipe via MCP A sur une période courte.
2. Claude analyse les observations et identifie un processus candidat.
3. Claude produit une représentation structurée (titre, objectif, étapes,
   relations, observations à l'appui, incertitudes).
4. Claude crée le workflow via les outils de MCP B.
5. Le front lit la base et affiche le graphe, le fil d'activité et la provenance.

Conséquence : pas de tunnel ni d'accès distant à `localhost:3030`. Claude
tourne sur la machine qui exécute Screenpipe ; seul MCP B est sur Internet.

**Ne pas confondre les deux intégrations** : MCP A = lecture de données ;
MCP B = action sur le workflow.

Pas de chat dans l'interface : la valeur de notre produit est dans les outils
MCP B, le graphe, le fil d'activité et la provenance. Un chat intégré est P2.

## 4. Stack et déploiement

- TypeScript partout, un seul projet, un seul service Railway.
- Backend Node avec le SDK MCP officiel TypeScript (serveur MCP B en HTTP).
- Front React + React Flow pour le graphe.
- Persistance : Postgres sur Railway (SQLite acceptable au début).
- Le front se met à jour par polling ou SSE quand MCP B modifie le workflow.
- Sécurité : clés API/MCP uniquement en variables d'environnement, jamais dans
  le front, le dépôt, les prompts ni les logs. MCP B exige une clé d'accès.
- Ne pas ajouter de dépendance ni faire de refactor massif sans nécessité.

> Section à compléter dès que le dépôt existe : commandes de lancement
> (front, backend, Screenpipe), commande de test, variables d'environnement.

## 5. MCP A — Screenpipe (lecture)

- Serveur officiel : `npx -y screenpipe-mcp`. Vérifier versions, config et
  outils réellement disponibles dans l'environnement.
- L'API locale est généralement sur `http://localhost:3030` ; tester
  `/health` puis une recherche réelle avant tout développement.
- Une recherche déclenchée manuellement sur une période limitée suffit.
  Le streaming continu n'est pas requis.
- Docs :
  https://github.com/screenpipe/screenpipe/blob/main/docs/mintlify/docs-mintlify-mig-tmp/mcp-server.mdx
  et https://github.com/screenpipe/screenpipe/tree/main/packages/screenpipe-mcp

## 6. MCP B — Notre application (action)

- Outils minimaux : `create_workflow`, `get_workflow`, `add_node`,
  `update_node`, `remove_node`, `connect_nodes`, `validate_workflow`.
- Ne développer que ce que la démo exige. Valider les arguments, l'identité du
  workflow, les références de nodes et les connexions.
- Vérifier l'appartenance du workflow au client courant avant toute mutation.
- Chaque appel est enregistré (outil, arguments utiles, résultat, heure) pour
  alimenter le fil d'activité.
- Le graphe affiché est rendu depuis le même modèle que celui modifié par les
  outils.
- Repli autorisé si MCP B bloque : fonction backend partagée, **explicitement
  signalée comme telle** dans l'UI.

## 7. Stratégie d'analyse

Ne pas traiter de vidéo complète. Partir des résultats de recherche structurés :
1. Interroger une période courte et précise.
2. Récupérer un nombre limité d'observations avec horodatage et application.
3. Les regrouper chronologiquement.
4. Faire proposer un processus candidat.
5. Utiliser frames ou extraits vidéo seulement si le texte ne suffit pas.
6. Produire un JSON validable : titre, objectif, étapes, relations, conditions,
   observations à l'appui, incertitudes.
7. Marquer chaque étape comme observée ou inférée.

Les outils MCP impliquent des appels de récupération : l'agent ne « voit pas
tout en direct ».

## 8. Modèle de données

Les nodes/edges sont la source de vérité ; canvas et outils MCP lisent et
modifient le même modèle. Le graphe n'est jamais une simple image.

- `Client` : id, name, statut Screenpipe, workflowIds.
- `Workflow` : id, clientId, name, description, status, sourceMode
  (`screenpipe_live` | `screenpipe_recorded` | `manual`), timestamps, nodes, edges.
- `WorkflowNode` : id, type, title, description, position, `origin`
  (`observed` | `inferred`), `observations[]` (texte, app source, horodatage).
- `WorkflowEdge` : id, source, target, label/condition.
- `ActivityEvent` : id, workflowId, tool, résumé, statut, timestamp.

## 9. Interface

**Image de référence : `docs/interface-reference.png`** (à consulter avant
toute tâche front). C'est une maquette générée par IA : elle donne la
**vision et l'ambiance**, pas l'interface finale ni un cahier des charges
pixel par pixel. Les écarts assumés sont listés ci-dessous.

Direction : application desktop premium, mode sombre, thème lune/cosmos
(croissant de lune en haut de la sidebar, fond noir/bleu nuit, étoiles
discrètes, nuages bleu-violet ; violet pour les interactions, vert pour les
statuts connectés).

### Ce qu'on reprend de la maquette

- **Sidebar gauche** : logo lune, bouton « Ajouter », recherche de client,
  liste de clients dépliables avec leurs workflows, et en bas le statut
  « Screenpipe connecté ».
- **En-tête** : fil d'Ariane `Client > Workflow`, ligne de provenance, date de
  dernière mise à jour, bouton « Exporter ».
- **Onglets** : « Vue Graph » (P0), « Détails » (= provenance par node, P1),
  « Logs » (= fil d'activité MCP, P1). « Historique » : P2.
- **Canvas central** : graphe type n8n, nodes avec logo de l'application,
  edges avec étiquettes de condition (`true` / `false`), barre de zoom,
  minimap. Seuls le graphe et le zoom sont P0 ; la minimap est du polish.
- **Panneau droit** : on garde l'emplacement (voir ci-dessous).

### Ce qu'on adapte (écarts avec la maquette)

1. **Pas de chat à droite.** La maquette montre un chat avec Claude, mais
   l'agent est Claude Desktop/Code (section 3). Un faux chat serait de la
   simulation. Le panneau droit devient le **fil d'activité MCP** : liste en
   direct des appels reçus par MCP B (outil, résumé, statut, heure), avec le
   même style visuel que dans la maquette (cartes sombres, étapes ajoutées en
   vert).
2. **« Outils MCP disponibles »** : on garde ce bloc de la maquette, mais il
   affiche la **liste réelle** des outils exposés par MCP B (lue depuis le
   serveur), pas des boutons décoratifs. Ces boutons ne déclenchent rien : ils
   documentent seulement ce que Claude peut faire. Ne pas les rendre
   cliquables sauf si l'action existe réellement.
3. **Champ de saisie « Demander à Claude… » : supprimé** (P2 si on intègre un
   jour un vrai chat).
4. **Exemple de la maquette ≠ notre scénario.** Elle montre une qualification
   de leads (Webhook, Notion, Slack, OpenAI…). Notre démo est le scénario
   comptable de la section 10. Les nodes affichent ce que l'agent a réellement
   déduit, avec l'application observée (Gmail, PDF, tableur…). Ne jamais
   afficher des nodes de la maquette pour faire joli.
5. **Les indicateurs de la maquette doivent être vrais :**
   - « Screenpipe connecté / dernière activité : il y a 2 min » → issu d'un
     vrai appel de santé et de la vraie date de dernière capture ; sinon
     « non connecté ».
   - « Workflow généré par l'IA · Basé sur l'activité réelle du client » → ce
     badge ne s'affiche que si `sourceMode = screenpipe_live`. Pour une
     session enregistrée : « Session enregistrée Screenpipe ». Pour un
     workflow créé à la main ou d'exemple : « Données d'exemple ». Jamais
     « activité réelle » sinon.
   - « Dernière mise à jour » → vrai timestamp en base.
   - Nombres de workflows dans la sidebar → comptés depuis la base.
6. **Clients de la maquette** (Acme Corp, Nova Studio, GreenTech…) : c'est du
   décor. Pour la démo, un seul client avec un seul workflow suffit ; les
   autres, s'ils sont affichés, portent le badge « exemple ».
7. **Boutons non fonctionnels** (Exporter, Ajouter, recherche, menu « ··· ») :
   ne pas les afficher, ou les désactiver clairement, tant qu'ils ne font rien.
8. **Provenance au clic sur un node** (absente de la maquette, mais P1) :
   observations Screenpipe, application, heure, badge observé/inféré.

### Priorités visuelles

1. P0 : graphe lisible rendu depuis la base + badge de source honnête +
   statut Screenpipe réel.
2. P1 : fil d'activité, bloc « Outils MCP », provenance, onglets.
3. Polish (dernières heures seulement) : thème lune/cosmos complet, étoiles,
   nuages, minimap, animations.

Le thème visuel ne doit jamais passer avant la preuve technique.

## 10. Scénario de démo

Scénario joué (capture réelle, données fictives, annoncé comme tel), 3 à 5 min,
exécuté et enregistré à l'avance :
1. Réception d'un mail client avec une facture fournisseur en PDF.
2. Ouverture du PDF : lecture du montant, de la date, du fournisseur.
3. Recopie dans un tableur de saisie.
4. Vérification du paiement dans un relevé bancaire fictif.
5. Envoi d'un mail de relance pour pièce manquante.

À adapter si les traces réelles montrent autre chose. Ne rien affirmer que les
données ne confirment pas.

Déroulé de la démo :
1. Screenpipe en fonctionnement.
2. Claude appelle réellement un outil MCP Screenpipe.
3. Observations récupérées affichées (application, horodatage).
4. Résumé de Claude identifiant le processus candidat.
5. Sortie structurée.
6. Appels MCP B visibles dans le fil d'activité, puis workflow dans le graphe.
7. Si possible : demande de modification en langage naturel, et appel MCP B qui
   modifie réellement le graphe.

Le jury doit comprendre la chaîne de causalité, pas seulement voir une belle UI.

## 11. Plan B

Si Screenpipe ne renvoie rien d'exploitable à H+10 : enregistrer une vraie
session, la figer en fichier de fixtures étiqueté « session enregistrée
Screenpipe », et l'afficher à l'écran (`sourceMode = screenpipe_recorded`).
Si MCP B distant ne se branche pas sur Claude Desktop, tester Claude Code ou
le pont `mcp-remote`.

## 12. Priorités

**P0 — Indispensable**
1. Screenpipe lancé, accès aux données prouvé (`/health` + recherche réelle).
2. Claude connecté à MCP A, récupération réelle.
3. Analyse des données réelles → processus candidat.
4. Résultat converti en nodes/edges structurés.
5. Graphe affiché dans l'interface.
6. Statut et provenance honnêtes.

**P1 — Après la boucle de base**
7. MCP B minimal branché sur Claude, hébergé sur Railway, avec clé d'accès.
8. Création du workflow par MCP B ; modification d'un node ou d'une connexion.
9. Fil d'activité et panneau de provenance par node.
10. Résumé des changements et actualisation du graphe depuis le modèle.

**P2 — Reporter si nécessaire**
Chat intégré, multi-client avancé, authentification complète, rôles, exécution
n8n, analyse continue, intégrations, historique avancé, animations.

En cas de conflit, protéger la boucle P0.

## 13. Répartition des rôles et tâches

Deadline : démo **dimanche 14h**. Gel du code à **12h**. Point de départ : samedi 18h30.

### Instruction à l'assistant de développement (Claude Code)

- Si la personne dit « je suis Irfan » : tu travailles sur les **tâches d'Irfan**
  ci-dessous, dans l'ordre, en commençant par la première case non cochée.
  Ne fais pas les tâches de Hugo.
- Si la personne dit « je suis Hugo » : même principe avec les tâches de Hugo.
- Si la personne ne dit pas qui elle est, demande-le avant de commencer.
- Commence en mode plan : propose un court plan pour la tâche en cours, attends la
  validation, puis exécute. Une tâche à la fois.
- Après chaque tâche : lance un test ciblé, dis ce qui fonctionne / est simulé /
  bloqué, coche la case dans ce fichier et propose un commit.
- Si une tâche dépend d'un travail de l'autre personne et que ce travail n'est pas
  fait, utilise des données de test **étiquetées « données de test » dans l'UI**
  et note la dépendance. Ne bloque pas.
- Ne modifie pas `shared/` (le contrat commun) sans le signaler : l'autre personne
  en dépend.

### Organisation du dépôt

- `web/` : front et API REST (Irfan).
- `mcp/` : serveur MCP B (Hugo).
- `shared/` : types et contrat commun (modifiés à deux, jamais en silence).
- Une branche par personne (`irfan/...`, `hugo/...`), petits commits, fusion dans
  `main` environ toutes les heures.

### Contrat commun (à figer en premier, ~20 min)

Les types de §8 dans `shared/types.ts` (`Client`, `Workflow`, `WorkflowNode`,
`WorkflowEdge`, `ActivityEvent`) et ces routes REST (dans `web/`), utilisées à la
fois par le front et par le serveur MCP B :
- `GET /api/workflows/:id` : workflow avec nodes et edges ;
- `GET /api/workflows/:id/activity` : événements d'activité ;
- les routes d'écriture nécessaires à MCP B (création, ajout/modif/suppression de
  node, connexion), à définir ensemble.

### Tâches d'Irfan (build : dépôt, API, front)

- [x] I1. Créer le dépôt, mettre CLAUDE.md à la racine, squelette TypeScript
      (`web/`, `mcp/`, `shared/`).
- [ ] I2. Rédiger `shared/types.ts` d’après §8 et le faire valider par Hugo. *(rédigé — en attente de validation par Hugo)*
- [x] I3. Base de données (SQLite d'abord, Postgres ensuite) et API REST du contrat.
- [ ] I4. Déployer le service sur Railway (variables d'environnement, jamais de clé
      dans le dépôt) et donner l'URL à Hugo.
- [ ] I5. Front : React Flow qui affiche un workflow lu depuis l'API (données de
      test étiquetées tant que MCP B n'écrit pas encore en base).
- [ ] I6. Rafraîchissement du graphe (polling ou SSE) quand le workflow change.
- [ ] I7. Panneau droit : fil d'activité des appels MCP, avec statut.
- [ ] I8. Panneau de provenance au clic sur un node : observations, application,
      heure, badge observé / inféré.
- [ ] I9. Badges de statut honnêtes : source des données, mode (live, session
      enregistrée, manuel), analyse en cours / résultat / erreur.
- [ ] I10. Sidebar (logo lune, clients, workflows) et thème lune/cosmos (polish,
      en dernier).

### Tâches de Hugo (Screenpipe, MCP, analyse, démo)

- [ ] H1. Tests Screenpipe : `/health`, recherche réelle, puis MCP A lu par Claude
      Code. Si ça échoue, diagnostiquer avant tout le reste.
- [ ] H2. **Enregistrer le scénario comptable** (3 à 5 min, données fictives, voir §10).
- [ ] H3. Test d'un MCP distant minimal (`hello`) sur le service Railway d'Irfan.
- [ ] H4. Serveur MCP B : `create_workflow`, `get_workflow`, `add_node`,
      `connect_nodes`, avec clé d'accès, validation des arguments et journal
      d'activité.
- [ ] H5. **Boucle P0 de bout en bout** : Claude lit Screenpipe, analyse, crée le
      workflow via MCP B, le graphe s'affiche.
- [ ] H6. Modification en langage naturel via MCP B (`update_node`, `remove_node`).
- [ ] H7. Plan B prêt (session enregistrée étiquetée) et scénario de démo répété.

### Calendrier

| Tranche | Hugo | Irfan |
|---|---|---|
| Sam. 18h30–20h | H1, H2 | I1 à I4 |
| Sam. 20h–22h | H3, H4 | I5, I6 |
| Sam. 22h–minuit | H5 (boucle P0) | I7, I8 |
| Dim. 9h–12h | H6, H7, bugs | I9, I10 |
| Dim. 12h | **Gel du code** | **Gel du code** |
| Dim. 12h–14h | Répétitions de la démo | Répétitions et support |

Vise minuit-1h pour la boucle P0, puis dors : un bug à 3h du matin coûte plus qu'il
ne rapporte.

## 14. Vérifications avant de coder (≈ 10 min chacune)

1. `localhost:3030/health` répond ; une recherche renvoie du texte récent.
2. Claude (Desktop ou Code) appelle MCP A et récupère des résultats utiles.
3. Un MCP distant minimal (un outil `hello`) est branché sur Claude depuis Railway.

Si l'un échoue, diagnostiquer immédiatement avant d'écrire le reste.

## 15. Consentement et confidentialité

- Données autorisées et consenties uniquement ; observations limitées au
  strict nécessaire.
- Ne pas envoyer inutilement de contenus sensibles à un modèle distant.
- Ne pas afficher ni logger mots de passe, tokens, données bancaires ou
  contenus privés inutiles.
- Ne jamais exposer un service de capture au réseau sans authentification.

## 16. Instructions générales à l'assistant de développement

Avant de coder : inspecter le dépôt, vérifier la connexion Screenpipe,
identifier le chemin minimal de bout en bout, donner un plan bref, puis
exécuter dans l'ordre P0.

Pendant : isoler l'adaptateur Screenpipe, le modèle de workflow et les outils
MCP B ; après chaque étape, lancer un test ciblé et indiquer ce qui fonctionne,
ce qui est simulé et ce qui est bloqué.

## 17. Définition du succès

Le MVP convainc si l'équipe montre : Screenpipe fonctionne ; Claude récupère
des données réelles via MCP A ; il en déduit un processus avec une explication
fondée sur les observations ; le processus devient nodes et edges affichés ;
MCP B permet de créer ou modifier le graphe ; les limites sont expliquées
honnêtement.

**Instruction finale :** commence par la connexion réelle MCP Screenpipe, puis
construis la boucle analyse → génération du workflow. Implémente MCP B dès que
la première boucle fonctionne. Tout le reste est secondaire.
