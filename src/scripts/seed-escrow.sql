-- 001_escrow_system.sql — seed data
-- 3 released escrows, 1 refunded escrow, 1 disputed (open) escrow.
-- Idempotent: rows keyed by unique sub_order_id via ON CONFLICT.
--
--   psql "$POSTGRES_URI" -f src/scripts/seed-escrow.sql
--
-- Fixed entity IDs (UUIDs stand in for Mongo ObjectIds):
--   SEL-1 = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa   (seller)
--   SEL-2 = cccccccc-cccc-cccc-cccc-cccccccccccc   (seller)
--   BUY-1 = bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb   (buyer)
--   BUY-2 = dddddddd-dddd-dddd-dddd-dddddddddddd   (buyer)

INSERT INTO escrow_ledger
  (sub_order_id, seller_id, buyer_id, amount_naira, seller_payout_naira, commission_naira, status, buyer_confirmed_at, released_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 50000.00, 47500.00, 2500.00, 'released', current_timestamp - interval '3 days', current_timestamp - interval '3 days'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 25000.00, 23750.00, 1250.00, 'released', current_timestamp - interval '5 days', current_timestamp - interval '5 days'),
  ('33333333-3333-3333-3333-333333333333', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100000.00, 90000.00, 10000.00, 'released', current_timestamp - interval '6 days', current_timestamp - interval '6 days')
ON CONFLICT (sub_order_id) DO NOTHING;

INSERT INTO escrow_ledger
  (sub_order_id, seller_id, buyer_id, amount_naira, seller_payout_naira, commission_naira, status, refund_reason, refunded_at)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 5000.00, 5000.00, 0.00, 'refunded', 'Buyer reported not received', current_timestamp - interval '2 days')
ON CONFLICT (sub_order_id) DO NOTHING;

INSERT INTO escrow_ledger
  (sub_order_id, seller_id, buyer_id, amount_naira, seller_payout_naira, commission_naira, status)
VALUES
  ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 30000.00, 28500.00, 1500.00, 'disputed')
ON CONFLICT (sub_order_id) DO NOTHING;

-- Open dispute + audit trail for the disputed escrow above.
INSERT INTO escrow_disputes (escrow_id, initiated_by, reason, status)
SELECT el.id, 'buyer', 'Item not delivered within the promised window', 'open'
FROM escrow_ledger el
WHERE el.sub_order_id = '55555555-5555-5555-5555-555555555555'
  AND NOT EXISTS (SELECT 1 FROM escrow_disputes d WHERE d.escrow_id = el.id);

INSERT INTO dispute_audit_log (dispute_id, action, actor, details)
SELECT d.id, 'created', 'system',
       jsonb_build_object('escrow_id', d.escrow_id, 'reason', d.reason, 'initiated_by', d.initiated_by)
FROM escrow_disputes d
LEFT JOIN dispute_audit_log l ON l.dispute_id = d.id
WHERE l.id IS NULL
  AND d.reason = 'Item not delivered within the promised window';