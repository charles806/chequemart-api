import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

// The escrow query layer reads from the same Neon Postgres as Sequelize.
// `POSTGRES_URI` is the canonical var; `DATABASE_URL` is accepted as an alias.
const connectionString = process.env.POSTGRES_URI || process.env.DATABASE_URL;

const isLocal =
  !connectionString ||
  connectionString.includes("localhost") ||
  connectionString.includes("127.0.0.1");

export const pool = connectionString
  ? new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 5000,
      // Neon requires SSL; skip it only for local dev servers.
      ssl: isLocal ? false : { rejectUnauthorized: false },
    })
  : null;

/**
 * Run a parameterized query against the escrow pool.
 * @param {string} text - SQL with $1, $2, ... placeholders
 * @param {Array} params - positional parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
export const query = async (text, params = []) => {
  if (!pool) {
    throw new Error(
      "Escrow database pool is not configured. Set POSTGRES_URI (or DATABASE_URL) in the environment."
    );
  }
  return pool.query(text, params);
};