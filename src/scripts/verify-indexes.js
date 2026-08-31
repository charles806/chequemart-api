import "dotenv/config";
import mongoose from "mongoose";

/**
 * Verifies that the expected MongoDB indexes exist on every collection.
 *
 * Expected specs mirror the indexes declared in src/models/*.model.js.
 * Comparison is by key pattern (e.g. "seller_1,createdAt_-1"), with checks
 * on unique / sparse / TTL flags. The Category `name_1` index is additionally
 * checked for its case-insensitive collation.
 *
 * Usage:
 *   npm run db:indexes           # dry-run: report missing / conflicting indexes
 *   npm run db:indexes:apply     # create missing indexes (background build)
 */

const EXPECTED_INDEXES = {
  users: [
    { key: { email: 1 }, unique: true, sparse: true },
    { key: { phone: 1 }, unique: true, sparse: true },
    { key: { emailVerificationToken: 1 }, sparse: true },
    { key: { passwordResetToken: 1 }, sparse: true },
  ],
  products: [
    { key: { category: 1 } },
    { key: { seller: 1 } },
    { key: { isActive: 1 } },
    { key: { isFeatured: 1 } },
    { key: { name: "text", description: "text" } },
    { key: { averageRating: -1 } },
    { key: { seller: 1, isActive: 1, createdAt: -1 } },
    { key: { isActive: 1, category: 1 } },
    { key: { createdAt: -1 } },
    { key: { sku: 1 }, unique: true, sparse: true },
  ],
  orders: [
    { key: { buyer: 1, createdAt: -1 } },
    { key: { buyer: 1, status: 1 } },
    { key: { seller: 1, createdAt: -1 } },
    { key: { seller: 1, status: 1 } },
    { key: { seller: 1, status: 1, createdAt: -1 } },
    { key: { status: 1 } },
    { key: { paymentStatus: 1 } },
    { key: { escrowId: 1 } },
    { key: { paymentReference: 1 }, sparse: true },
  ],
  carts: [
    { key: { user: 1 }, unique: true },
  ],
  sessions: [
    { key: { sessionId: 1 }, unique: true },
    { key: { userId: 1 } },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ],
  auditlogs: [
    { key: { action: 1 } },
    { key: { createdAt: -1 } },
    { key: { actorId: 1, createdAt: -1 } },
    { key: { targetType: 1, targetId: 1 } },
  ],
  supporttickets: [
    { key: { status: 1 } },
    { key: { email: 1 } },
    { key: { user: 1, createdAt: -1 } },
  ],
  webhookevents: [
    { key: { eventId: 1 }, unique: true },
    { key: { eventId: 1, status: 1 } },
    { key: { reference: 1 } },
  ],
  categories: [
    { key: { parentCategory: 1 } },
    { key: { isActive: 1 } },
    { key: { name: 1 }, unique: true, collation: { locale: "en", strength: 2 } },
    { key: { isActive: 1, parentCategory: 1 } },
  ],
};

const COLLATION_INDEXES = { categories: "name_1" };

// Legacy indexes that must exist WITHOUT a unique constraint.
// e.g. orders.paymentReference: batch checkout sets the SAME Paystack
// reference on multiple orders (multi-seller), so unique would throw E11000.
const LEGACY_UNIQUE_INDEXES = { orders: "paymentReference_1" };

function keyPattern(key) {
  return Object.entries(key)
    .map(([field, direction]) => `${field}_${direction}`)
    .join(",");
}

// MongoDB default index name (e.g. "name_text,description_text" -> "name_text_description_text").
// Text index keys are reported by the server as the internal {_fts, _ftsx} form,
// which the pattern comparison cannot match — the name fallback covers that case.
function defaultIndexName(key) {
  return Object.entries(key)
    .map(([field, direction]) => `${field}_${direction}`)
    .join("_");
}

function flagsMatch(actual, expected) {
  return (
    !!actual.unique === !!expected.unique &&
    !!actual.sparse === !!expected.sparse &&
    (actual.expireAfterSeconds ?? null) === (expected.expireAfterSeconds ?? null)
  );
}

function hasExpectedCollation(index) {
  const coll = index.collation;
  return !!coll && (coll.strength === 2) && (coll.locale || "").startsWith("en");
}

function buildIndexOptions(expected) {
  const options = { background: true };
  if (expected.unique !== undefined) options.unique = expected.unique;
  if (expected.sparse !== undefined) options.sparse = expected.sparse;
  if (expected.expireAfterSeconds !== undefined) options.expireAfterSeconds = expected.expireAfterSeconds;
  if (expected.collation) options.collation = expected.collation;
  return options;
}

export async function verify(connection, { apply = false, logger = console } = {}) {
  const db = connection.db;
  let exitCode = 0;

  for (const [collectionName, expectedIndexes] of Object.entries(EXPECTED_INDEXES)) {
    const exists = await db.listCollections({ name: collectionName }).toArray();
    if (exists.length === 0) {
      logger.log(`[SKIP] ${collectionName}: collection does not exist`);
      continue;
    }

    const actualIndexes = await db.collection(collectionName).indexes();
    const actualByPattern = new Map(
      actualIndexes.map((idx) => [keyPattern(idx.key), idx])
    );
    const actualByName = new Map(
      actualIndexes.map((idx) => [idx.name, idx])
    );

    logger.log(`\n${collectionName}:`);
    for (const expected of expectedIndexes) {
      const pattern = keyPattern(expected.key);
      const actual =
        actualByPattern.get(pattern) ?? actualByName.get(defaultIndexName(expected.key));
      const needsCollation = COLLATION_INDEXES[collectionName] === pattern;
      const mustNotBeUnique = LEGACY_UNIQUE_INDEXES[collectionName] === pattern;

      if (!actual) {
        logger.log(`  [MISSING] ${pattern}`);
        exitCode = 1;
        if (apply) {
          await db.collection(collectionName).createIndex(expected.key, buildIndexOptions(expected));
          logger.log(`  [CREATED] ${pattern}`);
        }
        continue;
      }

      if (
        !flagsMatch(actual, expected) ||
        (needsCollation && !hasExpectedCollation(actual)) ||
        (mustNotBeUnique && actual.unique)
      ) {
        const issue = mustNotBeUnique && actual.unique
          ? "legacy UNIQUE constraint (breaks batch checkout which shares one reference across orders)"
          : `unique=${actual.unique}, sparse=${actual.sparse}, ttl=${actual.expireAfterSeconds}, collation=${JSON.stringify(actual.collation ?? null)}`;
        logger.log(`  [MISMATCH] ${pattern} exists but differs from expected (${issue})`);
        exitCode = 1;

        if (apply && (needsCollation || mustNotBeUnique)) {
          // Drop the misconfigured index and recreate it correctly.
          await db.collection(collectionName).dropIndex(pattern);
          await db.collection(collectionName).createIndex(expected.key, buildIndexOptions(expected));
          logger.log(
            `  [REPLACED] ${pattern}${mustNotBeUnique ? " (unique constraint removed)" : " with case-insensitive unique index"}`
          );
        }
        continue;
      }

      logger.log(`  [OK] ${pattern}`);
    }
  }

  return exitCode;
}

// ────────────────────────────────────────────────────────────────
// CLI entry
// ────────────────────────────────────────────────────────────────
const isCli = process.argv[1] && process.argv[1].endsWith("verify-indexes.js");

if (isCli) {
  const apply = process.argv.includes("--apply");

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Cannot connect to MongoDB.");
    process.exit(1);
  }

  const run = async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log(`Connected. Running in ${apply ? "apply" : "dry-run"} mode.`);
    const exitCode = await verify(mongoose.connection, { apply });
    await mongoose.disconnect();
    process.exit(exitCode);
  };

  run().catch((err) => {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  });
}
