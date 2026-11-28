// server/index.js — Point d'entrée : DB → schéma → seed → express (API + statique)
// → WebSocket (parties temps réel + chat de clan) → boucle de maintenance.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { env, ROOT } from './env.js';
import { createDb } from './db/index.js';
import { schemaStatements, migrateJsonColumns } from './db/schema.js';
import { seed, loadGameConfig } from './db/seed.js';
import { attachUser } from './auth.js';
import { apiRoutes } from './routes/api.js';
import { metaRoutes } from './routes/meta.js';
import { adminRoutes } from './routes/admin.js';
import { GameServer } from './game/GameServer.js';
import { createClanHub } from './clans.js';
import { setupWebSocket } from './ws.js';

async function main() {
  console.log(`[bunker] démarrage (env=${env.NODE_ENV}, db=${env.DB_DRIVER})`);
  const db = await createDb();

  // Schéma + migration + seed (idempotents)
  for (const stmt of schemaStatements(db.dialect)) {
    await db.exec(stmt);
  }
  await migrateJsonColumns(db);
  await seed();
  const gameConfig = await loadGameConfig();

  // Hub WebSocket + notifications push
  const clanHub = createClanHub();
  const notifier = {
    pushTo: (userId, payload) => clanHub.pushTo(userId, payload),
    push: (userId, payload) => clanHub.pushTo(userId, payload),
    isOnline: (userId) => clanHub.isOnline(userId)
  };

  // Serveur de parties (autoritaire)
  const gameServer = new GameServer(db, () => gameConfig);

  // HTTP + Express
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' })); // uploads base64 (textures, sons)
  app.use(attachUser);

  // Statique : public/ + src/ (modules clients)
  const staticOpts = { index: 'index.html', maxAge: env.IS_PROD ? '1h' : 0 };
  app.use(express.static(path.join(ROOT, 'public'), staticOpts));
  app.use('/src', express.static(path.join(ROOT, 'src'), staticOpts));
  app.use('/data', express.static(path.join(ROOT, 'data'), staticOpts));

  // API
  app.use('/api', apiRoutes(notifier));
  app.use('/api', metaRoutes(notifier));
  app.use('/api/admin', adminRoutes(notifier, gameServer, gameConfig));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

  // Page unique
  app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

  const server = http.createServer(app);

  // WebSocket
  setupWebSocket(server, gameServer, clanHub);

  // Boucle de maintenance (matchmaking + salles) : 1 Hz
  const maintenance = setInterval(() => gameServer.maintenance(), 1000);
  maintenance.unref();

  server.listen(env.PORT, () => {
    console.log(`[bunker] prêt sur le port ${env.PORT} — http://localhost:${env.PORT}`);
  });

  // Arrêt propre
  const shutdown = () => {
    console.log('[bunker] arrêt…');
    clearInterval(maintenance);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('[bunker] erreur fatale au démarrage :', err);
  process.exit(1);
});
