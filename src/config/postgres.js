import pkg from "sequelize";
const { Sequelize } = pkg;
import "dotenv/config";

// Setup Sequelize instance
export const sequelize = new Sequelize(process.env.POSTGRES_URI, {
  dialect: "postgres",
  logging: console.log,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false // Neon DB requires this
    }
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

export const connectPostgres = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ PostgreSQL Connected: Financial tables");

    // We use alter: true to automatically update tables safely during MVP phase
    await sequelize.sync({ alter: true });
    console.log("✅ PostgreSQL schema synced");
  } catch (error) {
    console.error(`❌ PostgreSQL Connection Error: ${error.message}`);
    // Non-fatal error during dev, or you can choose to process.exit(1)
  }
};
