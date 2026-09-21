import { createEscrow } from "../db/escrowQueries.js";
import { ValidationError } from "../middleware/escrowValidation.js";

// Commission tiers (spec defaults, overridable via env):
//   < 10,000           → 0%
//   10,000 – 50,000    → 5%
//   > 50,000           → 10%
const envNumber = (key, fallback) => {
  const raw = process.env[key];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

const BELOW_MIN_THRESHOLD = envNumber("ESCROW_COMMISSION_BELOW_MIN_THRESHOLD", 10000);
const TIER1_MAX = envNumber("ESCROW_COMMISSION_TIER1_MAX", 50000);
const TIER_LOW_RATE = envNumber("ESCROW_COMMISSION_TIER_LOW_RATE", 5) / 100;
const TIER_HIGH_RATE = envNumber("ESCROW_COMMISSION_TIER_HIGH_RATE", 10) / 100;

const roundMoney = (n) => Math.round(n);

/**
 * Calculate platform commission based on the order amount tier.
 * @param {number|string} amountNaira
 * @returns {{ commission: number, sellerPayout: number, tier: string }}
 */
export function calculateCommission(amountNaira) {
  const amount = Number(amountNaira);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new ValidationError("amount_naira must be a non-negative number");
  }

  if (amount < BELOW_MIN_THRESHOLD) {
    return {
      commission: 0,
      sellerPayout: amount,
      tier: "below_minimum",
    };
  }

  if (amount <= TIER1_MAX) {
    const commission = roundMoney(amount * TIER_LOW_RATE);
    return {
      commission,
      sellerPayout: amount - commission,
      tier: `${Math.round(TIER_LOW_RATE * 100)}%`,
    };
  }

  const commission = roundMoney(amount * TIER_HIGH_RATE);
  return {
    commission,
    sellerPayout: amount - commission,
    tier: `${Math.round(TIER_HIGH_RATE * 100)}%`,
  };
}

/**
 * Compute commission and persist a new escrow ledger row atomically.
 * @param {Object} data - { subOrderId, sellerId, buyerId, amountNaira }
 * @returns {Promise<Object>} created escrow record
 */
export async function createEscrowWithCommission(data) {
  const { subOrderId, sellerId, buyerId, amountNaira } = data;
  const { commission, sellerPayout } = calculateCommission(amountNaira);

  return createEscrow({
    subOrderId,
    sellerId,
    buyerId,
    amountNaira,
    sellerPayoutNaira: sellerPayout,
    commissionNaira: commission,
  });
}