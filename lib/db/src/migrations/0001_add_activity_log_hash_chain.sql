-- Migration: add hash-chain columns to activity_log (additive, existing-DB safe)
--
-- seq: BIGSERIAL monotonic sequence column used as the canonical insertion-order
--   tie-breaker. Because seq is assigned by PostgreSQL under the serialization
--   advisory lock (pg_advisory_xact_lock 0x4C4F4748), its order is always
--   consistent with insertion order — even when two rows share the same
--   microsecond-precision created_at timestamp. Both the predecessor lookup in
--   insertActivityLog (ORDER BY seq DESC) and the verification walk in
--   GET /api/audit/chain-status (ORDER BY seq ASC) use seq as the sole ordering
--   key, guaranteeing a deterministic, tamper-evident chain.
--
-- prev_log_hash: logHash of the immediately preceding activity_log row ordered
--   by seq. NULL for the genesis entry and for pre-migration legacy rows.
--
-- log_hash: sha256("log:" + type + ":" + interactionId + ":" + summary
--           + ":" + createdAt.toISOString() + ":" + prevLogHash|"GENESIS")
--   NULL for pre-migration legacy rows (skipped, not failed, during verification).
--
-- Inserts are serialized via pg_advisory_xact_lock (key 0x4C4F4748) in
-- artifacts/api-server/src/lib/activity-log.ts. The DB-assigned created_at
-- (returned from INSERT … RETURNING) is used for hashing so the stored and
-- hashed timestamps always match.
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "seq" bigserial;
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "prev_log_hash" text;
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "log_hash" text;
