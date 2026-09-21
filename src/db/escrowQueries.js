import { query } from "./pool.js";
import { ConflictError, EscrowError } from "../middleware/escrowValidation.js";

/**
 * Create a new escrow record when an order is placed.
 * @param {Object} data - { subOrderId, sellerId, buyerId, amountNaira, sellerPayoutNaira, commissionNaira }
 * @returns {Promise<Object>} created escrow record
 */
export async function createEscrow(data) {
  const { subOrderId, sellerId, buyerId, amountNaira, sellerPayoutNaira, commissionNaira } = data;

  try {
    const { rows } = await query(
      `INSERT INTO escrow_ledger
        (sub_order_id, seller_id, buyer_id, amount_naira, seller_payout_naira, commission_naira)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [subOrderId, sellerId, buyerId, amountNaira, sellerPayoutNaira, commissionNaira]
    );
    return rows[0];
  } catch (err) {
    if (err.code === "23505") {
      throw new ConflictError(`Escrow already exists for sub_order_id: ${subOrderId}`);
    }
    if (err instanceof EscrowError) throw err;
    throw new EscrowError(`Failed to create escrow: ${err.message}`);
  }
}

/**
 * Get an escrow by its ledger id.
 * @param {number} escrowId
 * @returns {Promise<Object|null>}
 */
export async function getEscrowById(escrowId) {
  const { rows } = await query("SELECT * FROM escrow_ledger WHERE id = $1", [escrowId]);
  return rows[0] || null;
}

/**
 * Get an escrow by its sub_order_id.
 * @param {string} subOrderId
 * @returns {Promise<Object|null>}
 */
export async function getEscrowBySubOrderId(subOrderId) {
  const { rows } = await query("SELECT * FROM escrow_ledger WHERE sub_order_id = $1", [subOrderId]);
  return rows[0] || null;
}

/**
 * Release an escrow (buyer confirmed delivery).
 * Guarded update: only succeeds from status 'held'.
 * @param {number} escrowId
 * @param {string|null} reason - optional note appended to `notes`
 * @returns {Promise<Object|null>} updated escrow, or null if not held
 */
export async function releaseEscrow(escrowId, reason = null) {
  const { rows } = await query(
    `UPDATE escrow_ledger
        SET status = 'released',
            buyer_confirmed_at = COALESCE(buyer_confirmed_at, CURRENT_TIMESTAMP),
            released_at = CURRENT_TIMESTAMP,
            notes = CASE
              WHEN $2 IS NULL THEN notes
              ELSE COALESCE(notes, '') || E'\n[release] ' || $2
            END
      WHERE id = $1 AND status = 'held'
      RETURNING *`,
    [escrowId, reason]
  );
  return rows[0] || null;
}

/**
 * Refund an escrow (buyer didn't receive, or dispute resolved as refund).
 * Allowed from 'held' or 'disputed'.
 * @param {number} escrowId
 * @param {string} reason
 * @returns {Promise<Object|null>} updated escrow, or null if not in an refundable state
 */
export async function refundEscrow(escrowId, reason) {
  const { rows } = await query(
    `UPDATE escrow_ledger
        SET status = 'refunded',
            refund_reason = $2,
            refunded_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status IN ('held', 'disputed')
      RETURNING *`,
    [escrowId, reason]
  );
  return rows[0] || null;
}

/**
 * Mark an escrow as disputed (freeze payout).
 * @param {number} escrowId
 * @returns {Promise<Object|null>} updated escrow, or null if not held
 */
export async function markEscrowDisputed(escrowId) {
  const { rows } = await query(
    `UPDATE escrow_ledger
        SET status = 'disputed'
      WHERE id = $1 AND status = 'held'
      RETURNING *`,
    [escrowId]
  );
  return rows[0] || null;
}

/**
 * Get all pending (held) escrows for a seller.
 * @param {string} sellerId
 * @returns {Promise<Array>}
 */
export async function getSellerPendingEscrows(sellerId) {
  const { rows } = await query(
    `SELECT id, sub_order_id, amount_naira, seller_payout_naira, commission_naira, status, created_at
       FROM escrow_ledger
      WHERE seller_id = $1 AND status = 'held'
      ORDER BY created_at DESC`,
    [sellerId]
  );
  return rows;
}

/**
 * Get released escrows in the 2–7 day payout window (pending seller payout).
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<Array>}
 */
export async function getReleasedEscrowsPendingPayout(limit = 50, offset = 0) {
  const { rows } = await query(
    `SELECT id, sub_order_id, seller_id, buyer_id, amount_naira, seller_payout_naira, released_at
       FROM escrow_ledger
      WHERE status = 'released'
        AND released_at <= CURRENT_TIMESTAMP - INTERVAL '2 days'
        AND released_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
      ORDER BY released_at ASC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

/**
 * Total count of released escrows in the 2–7 day payout window (for pagination).
 * @returns {Promise<number>}
 */
export async function countReleasedEscrowsPendingPayout() {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total
       FROM escrow_ledger
      WHERE status = 'released'
        AND released_at <= CURRENT_TIMESTAMP - INTERVAL '2 days'
        AND released_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'`
  );
  return rows[0].total;
}

/**
 * Aggregate escrow stats for the dashboard.
 * @returns {Promise<Object>} { total_held, total_released, total_refunded,
 *   total_disputed, count_held, count_released, count_refunded, count_disputed }
 */
export async function getEscrowStats() {
  const { rows } = await query(
    `SELECT
        COALESCE(SUM(amount_naira) FILTER (WHERE status = 'held'), 0)     AS total_held,
        COALESCE(SUM(amount_naira) FILTER (WHERE status = 'released'), 0) AS total_released,
        COALESCE(SUM(amount_naira) FILTER (WHERE status = 'refunded'), 0) AS total_refunded,
        COALESCE(SUM(amount_naira) FILTER (WHERE status = 'disputed'), 0) AS total_disputed,
        COUNT(*) FILTER (WHERE status = 'held')                           AS count_held,
        COUNT(*) FILTER (WHERE status = 'released')                       AS count_released,
        COUNT(*) FILTER (WHERE status = 'refunded')                       AS count_refunded,
        COUNT(*) FILTER (WHERE status = 'disputed')                       AS count_disputed
       FROM escrow_ledger`
  );
  return rows[0];
}

/**
 * Update escrow notes (admin).
 * @param {number} escrowId
 * @param {string} notes
 * @returns {Promise<Object|null>} updated escrow, or null if not found
 */
export async function updateEscrowNotes(escrowId, notes) {
  const { rows } = await query(
    `UPDATE escrow_ledger
        SET notes = $2
      WHERE id = $1
      RETURNING *`,
    [escrowId, notes]
  );
  return rows[0] || null;
}