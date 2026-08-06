export const ESCROW_TRANSITIONS = {
  HELD: ["RELEASED", "REFUNDED", "DISPUTED", "EXPIRED"],
  DISPUTED: ["RELEASED", "REFUNDED"],
  RELEASED: [],
  REFUNDED: [],
  AUTO_RELEASED: [],
  EXPIRED: [],
};

export const validateEscrowTransition = (currentStatus, targetStatus) => {
  const allowed = ESCROW_TRANSITIONS[currentStatus];
  if (!allowed) {
    return { valid: false, message: `Invalid current escrow status: ${currentStatus}` };
  }
  if (!allowed.includes(targetStatus)) {
    return {
      valid: false,
      message: `Cannot transition escrow from ${currentStatus} to ${targetStatus}. Allowed: ${allowed.join(", ") || "none (terminal state)"}`,
    };
  }
  return { valid: true };
};
