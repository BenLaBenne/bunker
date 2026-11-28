// scripts/pg_default_test.mjs — vérifie que le DEFAULT survit à ALTER TYPE jsonb→text
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.PGURL });
await c.connect();

await c.query('DROP TABLE IF EXISTS _dflt_test');
await c.query(`CREATE TABLE _dflt_test (id SERIAL PRIMARY KEY, settings JSONB DEFAULT '{}')`);
await c.query(`INSERT INTO _dflt_test (id) VALUES (1)`);           // prend les defaults jsonb
await c.query(`ALTER TABLE _dflt_test ALTER COLUMN settings TYPE TEXT USING settings::text`);
await c.query(`INSERT INTO _dflt_test (id) VALUES (2)`);           // prend les defaults après migration
const r = await c.query(`SELECT id, settings, pg_typeof(settings)::text t FROM _dflt_test ORDER BY id`);
console.log(JSON.stringify(r.rows, null, 1));
await c.query('DROP TABLE _dflt_test');
await c.end();
