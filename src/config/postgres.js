import pkg from "sequelize";
const { Sequelize } = pkg;
import "dotenv/config";

// Eagerly load the PostgreSQL drivers. Sequelize resolves the `pg` and
// `pg-hstore` packages lazily via a dynamic require() at dialect-construction
// time. On serverless bundlers (Vercel) that dynamic require is not statically
// traced, so the packages get pruned from the bundle and Sequelize throws
// "Please install pg package manually" at cold start. Importing and referencing
// them here guarantees they are bundled and registered in the module cache
// before the Sequelize instance is constructed.
import pgModule from "pg";
import pgHstoreModule from "pg-hstore";

// Reference the drivers so the bundler keeps them (side-effect-only imports may
// be dropped). Resolving the identifiers at module load also populates Node's
// require cache, which Sequelize's lazy parentRequire() then finds.
const _pgDriver = pgModule;
const _pgHstoreDriver = pgHstoreModule;

const POSTGRES_URI = process.env.POSTGRES_URI;

// Setup Sequelize instance
// Guard against a missing POSTGRES_URI: constructing Sequelize(undefined)
// throws synchronously at import time, which would take down every module that
// imports a Sequelize model (and, on serverless, the whole function). Degrade
// to null instead so the app boots and per-request errors can be surfaced.
export const sequelize = POSTGRES_URI
  ? new Sequelize(POSTGRES_URI, {
      dialect: "postgres",
      logging: false,
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      },
      pool: {
        max: 5,
        min: 1,
        acquire: 30000,
        idle: 60000,
      },
    })
  : null;

export const connectPostgres = async () => {
  if (!sequelize) {
    console.warn("PostgreSQL skipped — POSTGRES_URI is not set");
    return;
  }
  try {
    await sequelize.authenticate();
    console.log("PostgreSQL Connected: Financial tables");
    // In development, sync models (safe for local dev)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log("PostgreSQL schema synced (dev mode)");
    } else {
      console.log("PostgreSQL: Running in production mode — migrations must be run manually.");
      console.log("  Run: npm run migrate");
    }
  } catch (error) {
    console.warn(`PostgreSQL Connection Warning: ${error.message}`);
  }
};

// Connection pool monitoring
if (sequelize) {
  sequelize.afterConnect(() => console.log('PostgreSQL: connection acquired'));
}
