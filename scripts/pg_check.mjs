// scripts/pg_check.mjs — vérifie la connexion PG (utilisé par test_pg.sh)
import pg from 'pg';

const url = process.env.PGURL;
const mode = process.argv[2] || 'version';

const c = new pg.Client({ connectionString: url });
await c.connect();

if (mode === 'version') {
  const r = await c.query('SELECT version()');
  console.log('pg client OK:', r.rows[0].version.slice(0, 45));
} else if (mode === 'clean') {
  const t = await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  for (const r of t.rows) await c.query(`DROP TABLE IF EXISTS ${r.tablename} CASCADE`);
  console.log('tables nettoyées:', t.rows.length);
} else if (mode === 'types') {
  const r = await c.query(`SELECT table_name||'.'||column_name k, data_type
    FROM information_schema.columns
    WHERE table_schema='public'
      AND column_name IN ('settings','payload','winners','config','targets','old_value','new_value','value','params')
    ORDER BY k`);
  console.log(r.rows.map(x => `${x.k}=${x.data_type}`).join('\n'));
}

await c.end();
