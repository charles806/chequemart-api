const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/**
 * Accept both UUIDs and Mongo ObjectIds — escrow ledger rows may reference
 * entities stored in Postgres (future sub_orders table) or MongoDB (today's
 * sellers/buyers/orders).
 */
export const isValidEntityId = (value) =>
  typeof value === "string" && (UUID_RE.test(value) || OBJECT_ID_RE.test(value));