const { Pool } = require('pg');

/**
 * PostgreSQL connection pool.
 * All connection parameters are pulled from environment variables
 * and default to sensible localhost values for development.
 */
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT, 10) || 5432,
  database: process.env.PG_DATABASE || 'warehouse_db',
  user: process.env.PG_USER || 'warehouse_admin',
  password: process.env.PG_PASSWORD || 'change_me_in_production',
  max: 20,                     // maximum clients in the pool
  idleTimeoutMillis: 30_000,   // close idle clients after 30 s
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err, client) => {
  console.error('[PG] Unexpected error on idle client', err.message);
});

/**
 * Execute a parameterised query and return rows.
 * @param {string} text  - SQL string
 * @param {Array}  params - Parameter values
 */
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
