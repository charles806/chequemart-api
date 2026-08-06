// 001-add-escrow-statuses.js
// Run with: node src/migrations/run.js
// Adds DISPUTED, AUTO_RELEASED, EXPIRED to the escrow status ENUM.

const NEW_ENUM_VALUES = ["DISPUTED", "AUTO_RELEASED", "EXPIRED"];
const POSSIBLE_ENUM_NAMES = ["enum_escrow_status", "enum_escrows_status"];

export async function up(queryInterface) {
  for (const enumName of POSSIBLE_ENUM_NAMES) {
    for (const value of NEW_ENUM_VALUES) {
      await queryInterface.sequelize.query(
        `ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS '${value}'`
      ).catch(() => {
        // Silently skip — at least one of the names will match
      });
    }
  }
}

export async function down(queryInterface) {
  // PostgreSQL cannot remove values from an ENUM type directly.
  // A full migration to recreate the type would be needed.
  // See: https://www.postgresql.org/docs/current/sql-altertype.html
  console.warn("Cannot remove ENUM values in PostgreSQL. Manual migration required.");
}
