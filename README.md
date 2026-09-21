# chequemart-api

Chequemart multi-vendor marketplace backend — Express.js API with MongoDB (Mongoose) for catalog/users/orders and PostgreSQL (Sequelize + raw SQL) for financial data.

## Escrow Ledger System (raw SQL)

A Postgres-native escrow source of truth with seller payout tracking and disputes, built on the `pg` driver (raw parameterized SQL) alongside the existing Sequelize financial tables.

### Schema

| Table                | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `escrow_ledger`      | Source of truth for escrow holds (held / released / refunded / disputed) |
| `seller_payouts`     | Bulk payments to sellers (Paystack transfers track from Task 2) |
| `escrow_disputes`    | Buyer/seller disputes linked to a ledger row                    |
| `dispute_audit_log`  | Append-only audit trail of dispute actions                      |

Status transitions: `held → released | refunded | disputed`, `disputed → released | refunded`. Amounts are `DECIMAL(10,2)` and split into `seller_payout_naira` + `commission_naira` at creation (immutable, `payout + commission = amount` enforced by CHECK). No FK constraints on `seller_id`/`buyer_id`/`sub_order_id` — those entities live in MongoDB, so ids are plain indexed columns accepting either UUIDs or Mongo ObjectIds.

### Setup

```bash
cd backend
npm install
cp .env.example .env         # fill in credentials

# 1. Create the escrow tables (idempotent)
psql "$POSTGRES_URI" -f src/migrations/001_escrow_system.sql

# 2. Optional: seed 5 test records (3 released, 1 refunded, 1 disputed)
psql "$POSTGRES_URI" -f src/scripts/seed-escrow.sql

# 3. Start the API
npm start                    # listens on $PORT (default 5000)
```

`NODE_ENV=development` runs `sequelize.sync({ alter: true })` for the existing models; the escrow ledger tables are only created by the migration above.

### API

All responses: `{ success, data, error?, timestamp }`. Mounted at `/api/escrow` and `/api/v1/escrow`.

| Method | Path                                     | Description                            |
| ------ | ---------------------------------------- | -------------------------------------- |
| POST   | `/api/escrow/create`                     | Create escrow (commission auto-calculated) |
| GET    | `/api/escrow/:escrow_id`                 | Get escrow by ledger id                |
| POST   | `/api/escrow/:escrow_id/release`         | Release escrow to seller (buyer confirmed) |
| POST   | `/api/escrow/:escrow_id/refund`          | Refund escrow (`reason` required)      |
| GET    | `/api/escrow/seller/:seller_id/pending`  | Seller's held escrows                  |
| GET    | `/api/escrow/pending-payout?limit&offset`| Released escrows in the 2–7 day payout window |
| GET    | `/api/escrow/stats`                      | Aggregate totals/counts per status     |

`POST /create` body: `{ sub_order_id, seller_id, buyer_id, amount_naira }`. Commission tiers (env-configurable): `<10k → 0%`, `10k–50k → 5%`, `>50k → 10%`.

```bash
# Create
curl -X POST http://localhost:5000/api/escrow/create \
  -H "Content-Type: application/json" \
  -d '{"sub_order_id":"<uuid-or-objectid>","seller_id":"<uuid>","buyer_id":"<uuid>","amount_naira":50000}'

# Release
curl -X POST http://localhost:5000/api/escrow/1/release \
  -H "Content-Type: application/json" -d '{"reason":"Buyer confirmed delivery"}'

# Stats
curl http://localhost:5000/api/escrow/stats
```

### Key files

- `src/migrations/001_escrow_system.sql` — schema (run via psql)
- `src/scripts/seed-escrow.sql` — seed data
- `src/db/pool.js` — `pg` connection pool (`POSTGRES_URI` / `DATABASE_URL`)
- `src/db/escrowQueries.js` — raw SQL query functions (all parameterized)
- `src/services/escrowService.js` — commission calculation + escrow creation
- `src/middleware/escrowValidation.js` — validation middleware + error classes
- `src/routes/escrow.routes.js` — `/api/escrow` endpoints