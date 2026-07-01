const { Pool } = require('pg');
const config = require('./config');

if (!config.databaseUrl) {
  console.warn('[db] DATABASE_URL no esta seteada. Configurala en .env antes de correr migrate/sync/server.');
}

const isRemote =
  config.databaseUrl &&
  !config.databaseUrl.includes('localhost') &&
  !config.databaseUrl.includes('127.0.0.1');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: isRemote ? { rejectUnauthorized: false } : false,
  // El pooler de Supabase (puerto 6543) tolera pocas conexiones concurrentes;
  // mantenemos el pool chico para no agotar cupos ni RAM en el free tier de Render.
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// Sin este handler, un error de socket idle (frecuente con poolers) tira el proceso entero.
pool.on('error', (err) => {
  console.error('[db] Error inesperado en cliente idle del pool:', err.message);
});

module.exports = pool;
