// Single service (Railway): REST API under /api + built front (web/dist).

import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db.ts';
import { createApi } from './app.ts';
import { seedTestData } from './seed.ts';

const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);
const apiKey = process.env.API_KEY || undefined;

if (!apiKey && isProd) {
  console.error('API_KEY manquante : refus de démarrer en production sans clé d’accès.');
  process.exit(1);
}
if (!apiKey) console.warn('⚠ API_KEY non définie : routes d’écriture ouvertes (dev local uniquement).');

const store = openDb(process.env.DATABASE_PATH ?? './moon.db');
if (store.isEmpty() && process.env.SEED_TEST_DATA !== 'false') {
  const wf = seedTestData(store);
  console.log(`Données de test insérées (workflow ${wf.id}).`);
}

const app = express();
app.use('/api', createApi({ store, apiKey }));

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.listen(port, () => console.log(`Moon API sur http://localhost:${port}`));
