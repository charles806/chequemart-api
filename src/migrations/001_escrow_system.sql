-- 001_escrow_system.sql
-- Raw PostgreSQL (Neon) migration for the escrow ledger system.
-- Idempotent: safe to run repeatedly via `psql`.
--
--   psql "$POSTGRES_URI" -f src/migrations/001_escrow_system.sql
--
-- Design notes:
--  * Amounts are DECIMAL(10,2) — money is never stored as float.
--  * Status columns are VARCHAR (not ENUM) so new statuses can be added
--    without a migration (spec requirement).
--  * Commission/payout split is computed once at creation and stored
--    immutably for auditing.
--  * seller_id / buyer_id / sub_order_id are plain (indexed) columns, NOT
--    foreign keys — those entities live in MongoDB (Mongo ObjectIds) and
--    there are no sellers/buyers/sub_orders tables in Postgres today.
--    sub_order_id links to the Mongo Order ObjectId (24-hex) or a UUID.
--  * The disputes tables (`escrow_disputes`, `dispute_audit_log`) DO use
--    FKs because both ends live in this migration.

-- ─────────────────────────────────────────
-- escrow_ledger — source of truth for holds
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escrow_ledger (
  id                  SERIAL PRIMARY KEY,
  sub_order_id        VARCHAR(64)    NOT NULL UNIQUE,
  seller_id           VARCHAR(64)    NOT NULL,
  buyer_id            VARCHAR(64)    NOT NULL,
  amount_naira        DECIMAL(10, 2) NOT NULL CHECK (amount_naira >= 0),
  seller_payout_naira DECIMAL(10, 2) NOT NULL CHECK (seller_payout_naira >= 0),
  commission_naira    DECIMAL(10, 2) NOT NULL CHECK (commission_naira >= 0),
  status              VARCHAR(20)    NOT NULL DEFAULT 'held',
  created_at          TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  buyer_confirmed_at  TIMESTAMP      NULL,
  released_at         TIMESTAMP      NULL,
  refund_reason       VARCHAR(500)   NULL,
  refunded_at         TIMESTAMP      NULL,
  notes               TEXT           NULL,
  -- Ledger integrity: the split must always reconcile to the paid amount.
  CHECK (seller_payout_naira + commission_naira = amount_naira)
);

CREATE INDEX IF NOT EXISTS idx_escrow_ledger_status_created ON escrow_ledger (status, created_at);
CREATE INDEX IF NOT EXISTS idx_escrow_ledger_seller_status ON escrow_ledger (seller_id, status);
CREATE INDEX IF NOT EXISTS idx_escrow_ledger_buyer_status   ON escrow_ledger (buyer_id, status);

-- ─────────────────────────────────────────
-- seller_payouts — bulk transfers to sellers
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seller_payouts (
  id                    SERIAL PRIMARY KEY,
  seller_id             VARCHAR(64)    NOT NULL,
  total_amount_naira    DECIMAL(10, 2) NOT NULL CHECK (total_amount_naira >= 0),
  status                VARCHAR(20)    NOT NULL DEFAULT 'pending',
  bank_name             VARCHAR(100)   NULL,
  account_number        VARCHAR(20)    NULL,
  account_holder_name   VARCHAR(100)   NULL,
  paystack_transfer_code VARCHAR(100)  NULL,
  initiated_at          TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  completed_at          TIMESTAMP      NULL,
  failure_reason        VARCHAR(500)   NULL,
  retry_count           INT            DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_seller_payouts_seller_status ON seller_payouts (seller_id, status);
CREATE INDEX IF NOT EXISTS idx_seller_payouts_status_initiated ON seller_payouts (status, initiated_at);

-- ─────────────────────────────────────────
-- escrow_disputes — buyer/seller dispute tracking
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escrow_disputes (
  id               SERIAL PRIMARY KEY,
  escrow_id        INT          NOT NULL REFERENCES escrow_ledger (id),
  initiated_by     VARCHAR(20)  NOT NULL CHECK (initiated_by IN ('buyer', 'seller', 'system')),
  reason           VARCHAR(500) NOT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'open',
  resolution       VARCHAR(20)  NULL CHECK (resolution IN ('refund', 'release')),
  resolution_notes TEXT         NULL,
  resolved_at      TIMESTAMP    NULL,
  resolved_by      VARCHAR(100) NULL,
  created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_escrow_disputes_status_created ON escrow_disputes (status, created_at);
CREATE INDEX IF NOT EXISTS idx_escrow_disputes_escrow_id     ON escrow_disputes (escrow_id);

-- ─────────────────────────────────────────
-- dispute_audit_log — audit trail for dispute actions
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispute_audit_log (
  id         SERIAL PRIMARY KEY,
  dispute_id INT          NOT NULL REFERENCES escrow_disputes (id) ON DELETE CASCADE,
  action     VARCHAR(50)  NOT NULL,
  actor      VARCHAR(100) NOT NULL,
  details    JSONB        NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dispute_audit_dispute_created ON dispute_audit_log (dispute_id, created_at);