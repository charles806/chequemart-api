import { isValidEntityId } from '../utils/validationUtils.js';

// ─────────────────────────────────────────
// Error classes
// ─────────────────────────────────────────
export class EscrowError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends EscrowError {
  constructor(message) {
    super(message, 400);
  }
}

export class NotFoundError extends EscrowError {
  constructor(message) {
    super(message, 404);
  }
}

export class ConflictError extends EscrowError {
  constructor(message) {
    super(message, 409);
  }
}

export class UnprocessableError extends EscrowError {
  constructor(message) {
    super(message, 422);
  }
}

// ─────────────────────────────────────────
// Request validators (Express middlewares)
// ─────────────────────────────────────────

const requiredFields = ['sub_order_id', 'seller_id', 'buyer_id', 'amount_naira'];

export const validateCreateEscrow = (req, res, next) => {
  const body = req.body || {};
  const missing = requiredFields.filter(
    (f) => body[f] === undefined || body[f] === null || body[f] === '',
  );

  if (missing.length > 0) {
    return next(new ValidationError(`Missing required field(s): ${missing.join(', ')}`));
  }

  for (const field of ['sub_order_id', 'seller_id', 'buyer_id']) {
    if (!isValidEntityId(body[field])) {
      return next(new ValidationError(`Invalid ${field}: must be a valid UUID or Mongo ObjectId`));
    }
  }

  const amount = Number(body.amount_naira);
  if (!Number.isFinite(amount) || amount <= 0) {
    return next(new ValidationError('amount_naira must be a positive number'));
  }

  next();
};

export const validateEscrowId = (req, res, next) => {
  const raw = req.params.escrow_id;
  const id = Number(raw);

  if (!Number.isInteger(id) || id <= 0 || String(raw) !== String(id)) {
    return next(new ValidationError('escrow_id must be a positive integer'));
  }

  next();
};

export const validateSellerId = (req, res, next) => {
  if (!isValidEntityId(req.params.seller_id)) {
    return next(new ValidationError('seller_id must be a valid UUID or Mongo ObjectId'));
  }
  next();
};

export const validateRefundReason = (req, res, next) => {
  const reason = (req.body || {}).reason;

  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return next(new UnprocessableError('reason is required'));
  }
  if (reason.trim().length > 500) {
    return next(new ValidationError('reason must be 500 characters or fewer'));
  }

  next();
};

export const validatePagination = (req, res, next) => {
  const { limit, offset } = req.query;

  if (limit !== undefined) {
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 1) {
      return next(new ValidationError('limit must be a positive integer'));
    }
    // Hard cap to protect against unbounded result sets.
    req.query.limit = Math.min(n, 100);
  }
  if (offset !== undefined) {
    const n = Number(offset);
    if (!Number.isInteger(n) || n < 0) {
      return next(new ValidationError('offset must be a non-negative integer'));
    }
    req.query.offset = n;
  }

  next();
};
