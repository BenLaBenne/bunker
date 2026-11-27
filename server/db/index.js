// server/db/index.js — Abstraction de base de données : PostgreSQL (production, Alwaysdata)
// et SQLite (développement local, zéro configuration). Requêtes paramétrées partout.
import { Pool } from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { env } from '../env.js';

class PgDb {
  constructor(opts) {
    this.dialect = 'postgres';
    this.pool = new Pool({
      connectionString: opts.url || undefined,
      host: opts.host, port: opts.port, database: opts.db,
      user: opts.user, password: opts.password,
      ssl: opts.ssl ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 30000
    });
  }
  /** Traduit les placeholders `?` en `$n` pour PostgreSQL. */
  #pg(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }
  async query(sql, params = []) {
    const res = await this.pool.query(this.#pg(sql), params);
    return res.rows;
  }
  async exec(sql) {
    await this.pool.query(sql);
  }
  async close() { await this.pool.end(); }
}

class SqliteDb {
  constructor(file) {
    this.dialect = 'sqlite';
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }
  async query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }
  async exec(sql) {
    this.db.exec(sql);
  }
  async close() { this.db.close(); }
}

/** Instance partagée, initialisée par createDb() au démarrage. */
export const db = {
  dialect: null,
  async query(_sql, _params) { throw new Error('DB not initialized — call createDb() first'); },
  async exec(_sql) { throw new Error('DB not initialized — call createDb() first'); },
  async close() {}
};

export async function createDb() {
  let impl;
  if (env.DB_DRIVER === 'postgres') {
    impl = new PgDb({
      url: env.DATABASE_URL,
      host: env.DB_HOST, port: env.DB_PORT, db: env.DB_NAME,
      user: env.DB_USER, password: env.DB_PASSWORD, ssl: env.DB_SSL
    });
    // Vérification de connexion
    await impl.query('SELECT 1');
    console.log('[db] PostgreSQL connecté');
  } else {
    const { default: path } = await import('node:path');
    const { default: fs } = await import('node:fs');
    const dir = new URL('../../data/', import.meta.url).pathname;
    fs.mkdirSync(dir, { recursive: true });
    impl = new SqliteDb(path.join(dir, 'bunker.db'));
    console.log('[db] SQLite connecté (développement local) — configurez DATABASE_URL pour PostgreSQL');
  }
  db.dialect = impl.dialect;
  db.query = impl.query.bind(impl);
  db.exec = impl.exec.bind(impl);
  db.close = impl.close.bind(impl);
  return db;
}

/** Convertit les valeurs JS pour le stockage (booléens → 0/1). */
export function b(v) { return v ? 1 : 0; }
