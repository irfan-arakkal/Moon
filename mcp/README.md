# mcp/ — MCP B (Hugo)

Serveur MCP (Streamable HTTP, `POST /mcp`) qui expose les outils d'action sur le workflow.
Il ne touche pas la base : chaque outil appelle la route REST correspondante de l'API
(`web/README.md`), qui valide les données, vérifie l'appartenance au client et enregistre
l'appel (succès ou erreur) dans le fil d'activité.

## Outils

`list_clients`, `create_workflow`, `get_workflow`, `add_node`, `update_node`, `remove_node`,
`connect_nodes`, `validate_workflow`, `set_workflow_status`.

Au démarrage, le serveur déclare cette liste à l'API (`PUT /api/mcp/tools`) : le bloc
« Outils MCP disponibles » de l'interface affiche donc la liste réelle.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `MCP_ACCESS_KEY` | **Obligatoire.** Clé exigée de Claude (`Authorization: Bearer …`). |
| `MOON_API_URL` | URL de l'API, ex. `https://<app>.up.railway.app/api` (défaut `http://localhost:3000/api`). |
| `MOON_API_KEY` | Valeur de `API_KEY` de l'API (clé des routes d'écriture). |
| `PORT` | Port d'écoute (défaut 8787). |

## Lancer et brancher sur Claude Code

```bash
npm run dev                                   # API :3000 + interface :5173
MCP_ACCESS_KEY=... npm run start:mcp          # MCP B :8787
claude mcp add --transport http moon http://localhost:8787/mcp -H "Authorization: Bearer $MCP_ACCESS_KEY"
```

Déploiement : second service Railway (racine du dépôt, commande `npm run start:mcp`),
avec les trois variables ci-dessus. Ne jamais mettre les clés dans le dépôt.

## Tests

`npm test` : le test d'intégration lance l'API réelle (base en mémoire) et MCP B, puis les
appelle avec le client MCP officiel (sans clé → 401, cycle complet, erreurs, appartenance).
