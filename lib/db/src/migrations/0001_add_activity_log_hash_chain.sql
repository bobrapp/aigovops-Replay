-- Migration: add hash-chain columns to activity_log (additive, existing-DB safe)
--
-- seq: BIGSERIAL monotonic sequence column — the canonical insertion-order key.
--   PostgreSQL assigns seq inside the same advisory-locked transaction
--   (pg_advisory_xact_lock 0x4C4F4748) as the insert, so seq order is always
--   consistent with insertion order even when two rows share a timestamp.
--   Both the predecessor lookup (ORDER BY seq DESC) and the verification walk
--   (ORDER BY seq ASC) use seq as the sole ordering key.
--
-- prev_log_hash: sha256 logHash of the immediately preceding row by seq.
--   NULL for the genesis entry and for pre-migration legacy rows.
--
-- log_hash: sha256("log:" + type + ":" + interactionId + ":" + summary
--           + ":" + createdAt.toISOString() + ":" + prevLogHash|"GENESIS")
--   NULL only for pre-migration legacy rows. Post-migration rows always receive
--   a non-null logHash from insertActivityLog (two-step insert: INSERT with
--   logHash=NULL placeholder → RETURNING createdAt → compute hash → UPDATE).
--   A DB CHECK constraint prevents any future INSERT from storing a literal
--   empty string (""), but cannot enforce non-null here because the two-step
--   insert requires a temporary NULL between the INSERT and the UPDATE.
--
-- Verification strategy:
--   GET /api/audit/chain-status walks all rows by seq ASC. Rows before the
--   first hashed entry are treated as legacy and skipped. Any NULL logHash
--   after the chain has started is flagged as tampered.
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "seq" bigserial;
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "prev_log_hash" text;
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "log_hash" text;
-- Prevent accidental empty-string logHash on post-migration rows.
ALTER TABLE "activity_log" DROP CONSTRAINT IF EXISTS "activity_log_log_hash_not_empty";
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_log_hash_not_empty"
  CHECK (log_hash IS NULL OR length(log_hash) > 0);
