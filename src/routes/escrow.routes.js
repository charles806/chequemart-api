import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import * as escrowQueries from "../db/escrowQueries.js";
import { createEscrowWithCommission } from "../services/escrowService.js";
import {
  NotFoundError,
  ValidationError,
  validateCreateEscrow,
  validateEscrowId,
  validatePagination,
  validateRefundReason,
  validateSellerId,
} from "../middleware/escrowValidation.js";

const router = Router();

const money = (v) => Number(v);
const now = () => new Date().toISOString();

const ledgerView = (row) => ({
  id: row.id,
  sub_order_id: row.sub_order_id,
  seller_id: row.seller_id,
  buyer_id: row.buyer_id,
  amount_naira: money(row.amount_naira),
  seller_payout_naira: money(row.seller_payout_naira),
  commission_naira: money(row.commission_naira),
  status: row.status,
  created_at: row.created_at,
  buyer_confirmed_at: row.buyer_confirmed_at,
  released_at: row.released_at,
  refund_reason: row.refund_reason,
  refunded_at: row.refunded_at,
});

// ─────────────────────────────────────────
// Endpoint 1: Create Escrow
// ─────────────────────────────────────────
router.post(
  "/create",
  validateCreateEscrow,
  asyncHandler(async (req, res) => {
    const { sub_order_id, seller_id, buyer_id, amount_naira } = req.body;

    const escrow = await createEscrowWithCommission({
      subOrderId: sub_order_id,
      sellerId: seller_id,
      buyerId: buyer_id,
      amountNaira: amount_naira,
    });

    res.json({
      success: true,
      data: {
        escrow_id: escrow.id,
        amount_naira: money(escrow.amount_naira),
        seller_payout_naira: money(escrow.seller_payout_naira),
        commission_naira: money(escrow.commission_naira),
        status: escrow.status,
        created_at: escrow.created_at,
      },
      timestamp: now(),
    });
  })
);

// ─────────────────────────────────────────
// Endpoint 7: Get Escrow Stats
// ─────────────────────────────────────────
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const stats = await escrowQueries.getEscrowStats();
    res.json({ success: true, data: stats, timestamp: now() });
  })
);

// ─────────────────────────────────────────
// Endpoint 6: Get Released Escrows Pending Payout
// ─────────────────────────────────────────
router.get(
  "/pending-payout",
  validatePagination,
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;

    const [rows, total] = await Promise.all([
      escrowQueries.getReleasedEscrowsPendingPayout(limit, offset),
      escrowQueries.countReleasedEscrowsPendingPayout(),
    ]);

    res.json({
      success: true,
      data: rows.map((r) => ({
        escrow_id: r.id,
        seller_id: r.seller_id,
        amount_naira: money(r.amount_naira),
        released_at: r.released_at,
      })),
      pagination: { limit, offset, total },
      timestamp: now(),
    });
  })
);

// ─────────────────────────────────────────
// Endpoint 5: Get Seller's Pending Escrows
// ─────────────────────────────────────────
router.get(
  "/seller/:seller_id/pending",
  validateSellerId,
  asyncHandler(async (req, res) => {
    const rows = await escrowQueries.getSellerPendingEscrows(req.params.seller_id);

    res.json({
      success: true,
      data: rows.map((r) => ({
        escrow_id: r.id,
        sub_order_id: r.sub_order_id,
        amount_naira: money(r.amount_naira),
        seller_payout_naira: money(r.seller_payout_naira),
        status: r.status,
        created_at: r.created_at,
      })),
      timestamp: now(),
    });
  })
);

// ─────────────────────────────────────────
// Endpoint 2: Get Escrow
// ─────────────────────────────────────────
router.get(
  "/:escrow_id",
  validateEscrowId,
  asyncHandler(async (req, res) => {
    const escrow = await escrowQueries.getEscrowById(Number(req.params.escrow_id));

    if (!escrow) {
      throw new NotFoundError(`Escrow ${req.params.escrow_id} not found`);
    }

    res.json({ success: true, data: ledgerView(escrow), timestamp: now() });
  })
);

const requireState = (escrow, allowed, action) => {
  if (!escrow) {
    throw new NotFoundError(`Escrow not found`);
  }
  if (!allowed.includes(escrow.status)) {
    throw new ValidationError(
      `Cannot ${action} escrow ${escrow.id}: current status is '${escrow.status}'`
    );
  }
};

// ─────────────────────────────────────────
// Endpoint 3: Release Escrow
// ─────────────────────────────────────────
router.post(
  "/:escrow_id/release",
  validateEscrowId,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.escrow_id);
    const existing = await escrowQueries.getEscrowById(id);
    requireState(existing, ["held"], "release");

    const reason =
      typeof req.body?.reason === "string" && req.body.reason.trim()
        ? req.body.reason.trim()
        : null;

    const escrow = await escrowQueries.releaseEscrow(id, reason);

    res.json({
      success: true,
      data: {
        escrow_id: escrow.id,
        status: escrow.status,
        released_at: escrow.released_at,
        seller_payout_naira: money(escrow.seller_payout_naira),
      },
      timestamp: now(),
    });
  })
);

// ─────────────────────────────────────────
// Endpoint 4: Refund Escrow
// ─────────────────────────────────────────
router.post(
  "/:escrow_id/refund",
  validateEscrowId,
  validateRefundReason,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.escrow_id);
    const existing = await escrowQueries.getEscrowById(id);
    requireState(existing, ["held", "disputed"], "refund");

    const escrow = await escrowQueries.refundEscrow(id, req.body.reason.trim());

    res.json({
      success: true,
      data: {
        escrow_id: escrow.id,
        status: escrow.status,
        refunded_at: escrow.refunded_at,
        refund_reason: escrow.refund_reason,
      },
      timestamp: now(),
    });
  })
);

export default router;