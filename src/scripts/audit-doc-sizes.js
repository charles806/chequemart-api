import "dotenv/config";
import mongoose from "mongoose";

/**
 * Audits MongoDB document sizes across every collection using $bsonSize.
 *
 * MongoDB rejects writes over the 16MB BSON limit (16777216 bytes). This
 * script surfaces the largest documents per collection so runaway growth
 * (unbounded embedded arrays, oversized Mixed fields) is caught early.
 *
 * Exit codes:
 *   0 — all docs healthy (< 8MB)
 *   1 — at least one doc >= 8MB (at risk; approaching the limit)
 *   2 — at least one doc >= 16MB (this state is only reachable if a write
 *       path bypassed MongoDB's size enforcement, e.g. via a script)
 *
 * Usage:
 *   npm run db:audit:size
 */

const WARN_BYTES = 8 * 1024 * 1024; // 8MB
const FAIL_BYTES = 16 * 1024 * 1024; // 16MB

const COLLECTIONS = [
  "users",
  "products",
  "orders",
  "carts",
  "sessions",
  "auditlogs",
  "supporttickets",
  "webhookevents",
  "categories",
];

const BYTES_PER_MB = 1024 * 1024;

function fmt(bytes) {
  return `${(bytes / BYTES_PER_MB).toFixed(2)}MB`;
}

export async function audit(connection, { logger = console } = {}) {
  let exitCode = 0;

  for (const collectionName of COLLECTIONS) {
    const coll = connection.collection(collectionName);
    const exists = await connection.db.listCollections({ name: collectionName }).toArray();
    if (exists.length === 0) {
      logger.log(`[SKIP] ${collectionName}: collection does not exist`);
      continue;
    }

    const total = await coll.countDocuments({});
    const pipeline = [
      { $project: { sizeBytes: { $bsonSize: "$$ROOT" } } },
      { $sort: { sizeBytes: -1 } },
      { $limit: 5 },
    ];
    const largest = await coll.aggregate(pipeline).toArray();

    const worst = largest[0]?.sizeBytes ?? 0;
    const flag = worst >= FAIL_BYTES ? "[FAIL]" : worst >= WARN_BYTES ? "[WARN]" : "[OK]  ";
    logger.log(
      `${flag} ${collectionName}: ${total} doc(s), largest ${fmt(worst)} (top: ${largest
        .map((d) => fmt(d.sizeBytes))
        .join(", ")})`
    );

    if (worst >= FAIL_BYTES) exitCode = Math.max(exitCode, 2);
    else if (worst >= WARN_BYTES) exitCode = Math.max(exitCode, 1);
  }

  return exitCode;
}

// ────────────────────────────────────────────────────────────────
// CLI entry
// ────────────────────────────────────────────────────────────────
const isCli = process.argv[1] && process.argv[1].endsWith("audit-doc-sizes.js");

if (isCli) {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Cannot connect to MongoDB.");
    process.exit(1);
  }

  const run = async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const exitCode = await audit(mongoose.connection);
    await mongoose.disconnect();
    process.exit(exitCode);
  };

  run().catch((err) => {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  });
}
