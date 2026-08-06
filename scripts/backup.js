import { execSync } from "child_process";
import { join } from "path";

const BACKUP_DIR = join(process.cwd(), "backups");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

console.log(`Starting backup at ${timestamp}`);

// PostgreSQL backup
try {
  const pgUri = process.env.POSTGRES_URI;
  if (pgUri) {
    execSync(`pg_dump "${pgUri}" | gzip > "${BACKUP_DIR}/postgres-${timestamp}.sql.gz"`, { stdio: "inherit" });
    console.log("PostgreSQL backup complete");
  }
} catch (err) {
  console.error("PostgreSQL backup failed:", err.message);
}

// MongoDB backup
try {
  const mongoUri = process.env.MONGO_URI;
  if (mongoUri) {
    execSync(`mongodump --uri="${mongoUri}" --archive="${BACKUP_DIR}/mongo-${timestamp}.gz" --gzip`, { stdio: "inherit" });
    console.log("MongoDB backup complete");
  }
} catch (err) {
  console.error("MongoDB backup failed:", err.message);
}

console.log("Backup complete");
