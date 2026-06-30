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
});

module.exports = pool;
