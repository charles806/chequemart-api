import pkg from "sequelize";
const { Sequelize } = pkg;
import "dotenv/config";

// Setup Sequelize instance
export const sequelize = new Sequelize(process.env.POSTGRES_URI, {
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
});

export const connectPostgres = async () => {
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
sequelize.afterConnect(() => console.log('PostgreSQL: connection acquired'));
