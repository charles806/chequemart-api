import "dotenv/config";
import mongoose from "mongoose";

/**
 * MongoDB-native schema validation ($jsonSchema) for every Mongoose collection.
 *
 * Enforcement happens at the database level, so writes bypassing Mongoose
 * (raw drivers, scripts, future migrations) are validated too.
 *
 * Design notes:
 * - `required` is intentionally NOT set at the DB level: Mongoose enforces
 *   required fields, and DB-level `required` would break the partial
 *   updateMany / $set write paths (e.g. batch stock decrements).
 * - `additionalProperties` is left open so Mixed fields and legacy documents
 *   keep working. The schema constrains known fields only.
 * - `validationLevel: "strict"` validates every insert and update.
 *
 * Usage:
 *   npm run db:validate          # dry-run: report docs violating the schemas
 *   npm run db:validate:apply    # apply validators via createCollection/collMod
 */

const COLLECTIONS = {
  users: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        name: { bsonType: "string", maxLength: 60 },
        email: { bsonType: "string" },
        phone: { bsonType: "string" },
        role: { enum: ["admin", "buyer", "seller"] },
        authMethod: { enum: ["local", "phone"] },
        isVerified: { bsonType: "bool" },
        isActive: { bsonType: "bool" },
        avatar: { bsonType: ["string", "null"] },
        tokenVersion: { bsonType: "int" },
        failedLoginAttempts: { bsonType: "int", minimum: 0 },
        lockedUntil: { bsonType: ["date", "null"] },
        sellerInfo: { bsonType: "object" },
        deliveryAddresses: { bsonType: "array", maxItems: 10 },
      },
    },
  },
  products: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        name: { bsonType: "string", maxLength: 100 },
        description: { bsonType: "string", maxLength: 2000 },
        price: { bsonType: "number", minimum: 0 },
        discountPrice: { bsonType: "number", minimum: 0 },
        category: { bsonType: "string", maxLength: 60 },
        images: { bsonType: "array", maxItems: 10 },
        condition: { enum: ["Brand New", "Like New", "Fairly Used", "Refurbished"] },
        stock: { bsonType: "number", minimum: 0 },
        sku: { bsonType: "string", maxLength: 64 },
        seller: { bsonType: "objectId" },
        isActive: { bsonType: "bool" },
        isFeatured: { bsonType: "bool" },
        specifications: { bsonType: "object" },
        deliveryFee: { bsonType: "number", minimum: 0 },
        variants: { bsonType: "array", maxItems: 20 },
        ratings: { bsonType: "array", maxItems: 200 },
        averageRating: { bsonType: "number", minimum: 0, maximum: 5 },
        totalReviews: { bsonType: "number", minimum: 0 },
      },
    },
  },
  orders: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        seller: { bsonType: "objectId" },
        buyer: { bsonType: "objectId" },
        products: { bsonType: "array", maxItems: 100 },
        totalAmount: { bsonType: "number", minimum: 0 },
        status: { enum: ["pending", "processing", "confirmed", "shipped", "delivered", "collected", "cancelled"] },
        paymentStatus: { enum: ["pending", "paid", "unpaid", "refunded", "failed"] },
        trackingNumber: { bsonType: ["string", "null"], maxLength: 100 },
        carrier: { bsonType: ["string", "null"], maxLength: 50 },
        trackingHistory: { bsonType: "array", maxItems: 100 },
        shippingAddress: { bsonType: "object" },
        escrowId: { bsonType: ["string", "null"] },
        paymentReference: { bsonType: ["string", "null"] },
        isPaid: { bsonType: "bool" },
        paidAt: { bsonType: ["date", "null"] },
      },
    },
  },
  carts: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        user: { bsonType: "objectId" },
        items: { bsonType: "array", maxItems: 50 },
        wishlist: { bsonType: "array", maxItems: 100 },
      },
    },
  },
  sessions: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        sessionId: { bsonType: "string", maxLength: 200 },
        userId: { bsonType: "objectId" },
        accessToken: { bsonType: "string" },
        refreshToken: { bsonType: "string" },
        userSnapshot: { bsonType: ["object", "null"] },
        expiresAt: { bsonType: "date" },
      },
    },
  },
  auditlogs: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        action: { bsonType: "string", maxLength: 100 },
        actorId: { bsonType: "objectId" },
        targetId: { bsonType: ["objectId", "string", "null"] },
        targetType: { bsonType: "string", maxLength: 50 },
        changes: { bsonType: "object" },
        ipAddress: { bsonType: "string" },
        userAgent: { bsonType: "string" },
        metadata: { bsonType: "object" },
      },
    },
  },
  supporttickets: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        user: { bsonType: ["objectId", "null"] },
        name: { bsonType: "string", maxLength: 100 },
        email: { bsonType: "string" },
        subject: { bsonType: "string", maxLength: 200 },
        message: { bsonType: "string", maxLength: 2000 },
        status: { enum: ["open", "in_progress", "resolved", "closed"] },
        adminNotes: { bsonType: ["string", "null"] },
      },
    },
  },
  webhookevents: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        eventId: { bsonType: "string" },
        eventType: { bsonType: "string", maxLength: 100 },
        reference: { bsonType: ["string", "null"] },
        status: { enum: ["processed", "failed"] },
        processedAt: { bsonType: "date" },
      },
    },
  },
  categories: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        name: { bsonType: "string", maxLength: 60 },
        description: { bsonType: "string", maxLength: 500 },
        image: { bsonType: ["string", "null"] },
        isActive: { bsonType: "bool" },
        parentCategory: { bsonType: ["objectId", "null"] },
        order: { bsonType: "number", minimum: 0 },
      },
    },
  },
};

export function getValidationSchemas() {
  return COLLECTIONS;
}

async function countSchemaViolations(connection, collectionName, schema) {
  const coll = connection.collection(collectionName);
  const total = await coll.countDocuments({});
  if (total === 0) {
    return { total: 0, violations: 0, samples: [] };
  }

  const conforming = await coll.countDocuments({ $jsonSchema: schema });
  const violations = total - conforming;

  const samples = [];
  if (violations > 0) {
    const cursor = coll
      .find({ $nor: [{ $jsonSchema: schema }] })
      .project({ _id: 1 })
      .limit(5);
    for await (const doc of cursor) {
      samples.push(doc._id.toString());
    }
  }

  return { total, violations, samples };
}

export async function dryRun(connection, { logger = console } = {}) {
  let failed = false;
  for (const [collectionName, { $jsonSchema: schema }] of Object.entries(COLLECTIONS)) {
    const { total, violations, samples } = await countSchemaViolations(
      connection,
      collectionName,
      schema
    );
    if (violations === 0) {
      logger.log(`[OK]   ${collectionName}: ${total} doc(s) conform to schema`);
    } else {
      failed = true;
      logger.log(
        `[FAIL] ${collectionName}: ${violations}/${total} doc(s) violate the schema (samples: ${samples.join(", ") || "n/a"})`
      );
    }
  }
  if (failed) {
    logger.log("\nSchema violations found. Fix the docs or drop the offending fields before applying.");
  } else {
    logger.log("\nAll collections conform to their schemas. Safe to apply (npm run db:validate:apply).");
  }
  return failed ? 1 : 0;
}

export async function apply(connection, { logger = console } = {}) {
  let failed = false;

  for (const [collectionName, { $jsonSchema: schema }] of Object.entries(COLLECTIONS)) {
    const { total, violations } = await countSchemaViolations(
      connection,
      collectionName,
      schema
    );
    if (violations > 0) {
      failed = true;
      logger.log(
        `[SKIP] ${collectionName}: ${violations}/${total} existing doc(s) violate the schema — fix them first (see npm run db:validate)`
      );
      continue;
    }

    const db = connection.db;
    const exists = await db.listCollections({ name: collectionName }).toArray();
    const options = {
      validator: { $jsonSchema: schema },
      validationLevel: "strict",
      validationAction: "error",
    };

    try {
      if (exists.length === 0) {
        await db.createCollection(collectionName, options);
        logger.log(`[OK]   ${collectionName}: created with $jsonSchema validator`);
      } else {
        await db.command({ collMod: collectionName, ...options });
        logger.log(`[OK]   ${collectionName}: validator applied via collMod`);
      }
    } catch (err) {
      failed = true;
      logger.log(`[ERR]  ${collectionName}: ${err.message}`);
    }
  }

  return failed ? 1 : 0;
}

// ────────────────────────────────────────────────────────────────
// CLI entry
// ────────────────────────────────────────────────────────────────
const isCli = process.argv[1] && process.argv[1].endsWith("apply-mongo-validation.js");

if (isCli) {
  const mode = process.argv.includes("--apply") ? "apply" : "dry-run";

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set. Cannot connect to MongoDB.");
    process.exit(1);
  }

  const run = async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log(`Connected. Running in ${mode} mode.\n`);
    const exitCode = mode === "apply" ? await apply(mongoose.connection) : await dryRun(mongoose.connection);
    await mongoose.disconnect();
    process.exit(exitCode);
  };

  run().catch((err) => {
    console.error(`Failed: ${err.message}`);
    process.exit(1);
  });
}
