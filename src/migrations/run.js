import "dotenv/config";
import { sequelize } from "../config/postgres.js";

const NEW_ENUM_VALUES = ["DISPUTED", "AUTO_RELEASED", "EXPIRED"];

async function findEscrowStatusEnum() {
  // Sequelize v6 can generate the ENUM as "enum_escrow_status" or
  // "enum_escrows_status" depending on how it resolves the table name.
  // Probe pg_type for both patterns.
  const [rows] = await sequelize.query(`
    SELECT t.typname
    FROM pg_type t
    WHERE t.typname IN ('enum_escrow_status', 'enum_escrows_status')
      AND t.typtype = 'e'
    LIMIT 1
  `);
  return rows.length > 0 ? rows[0].typname : null;
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log("Connected to PostgreSQL.");

    const enumName = await findEscrowStatusEnum();

    if (!enumName) {
      console.log("Escrow status ENUM not found — table may not exist yet. Skipping migration.");
      await sequelize.close();
      return;
    }

    console.log(`Found ENUM type: ${enumName}`);

    for (const value of NEW_ENUM_VALUES) {
      await sequelize.query(
        `ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${value}'`
      );
      console.log(`  Added value: ${value}`);
    }

    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
