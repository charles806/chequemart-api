-- 001-add-escrow-statuses.sql
-- Adds DISPUTED, AUTO_RELEASED, and EXPIRED to the escrow status ENUM.
-- PostgreSQL ENUMs support ADD VALUE without table rewrite (PG 9.1+).
-- Each statement is wrapped so it can be run inside or outside a transaction.

ALTER TYPE "enum_escrows_status" ADD VALUE IF NOT EXISTS 'DISPUTED';
ALTER TYPE "enum_escrows_status" ADD VALUE IF NOT EXISTS 'AUTO_RELEASED';
ALTER TYPE "enum_escrows_status" ADD VALUE IF NOT EXISTS 'EXPIRED';
