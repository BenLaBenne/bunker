// server/env.js — Chargement des variables d'environnement (+ fichier .env optionnel)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv();

export const env = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD: process.env.NODE_ENV === 'production',
  DATABASE_URL: process.env.DATABASE_URL || '',
  DB_HOST: process.env.DB_HOST || '',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_NAME: process.env.DB_NAME || '',
  DB_USER: process.env.DB_USER || '',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_SSL: String(process.env.DB_SSL || 'false') === 'true',
  SESSION_SECRET: process.env.SESSION_SECRET || 'bunker-dev-secret-please-change',
  SESSION_DAYS: parseInt(process.env.SESSION_DAYS || '30', 10),
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || ''
};

// Détection du driver : DB_DRIVER explicite, sinon DATABASE_URL postgres://,
// sinon DB_HOST (Postgres séparé), sinon SQLite local (dev).
(() => {
  const explicit = process.env.DB_DRIVER;
  const url = process.env.DATABASE_URL || '';
  if (explicit) { env.DB_DRIVER = explicit; return; }
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) { env.DB_DRIVER = 'postgres'; return; }
  if (process.env.DB_HOST) { env.DB_DRIVER = 'postgres'; return; }
  env.DB_DRIVER = 'sqlite';
})();
