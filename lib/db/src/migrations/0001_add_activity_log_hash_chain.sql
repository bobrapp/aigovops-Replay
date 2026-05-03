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
--   NULL only for pre-migration legacy rows (those that existed before this
--   migration). Post-migration rows always receive a non-null logHash from
--   insertActivityLog (two-step insert: INSERT with logHash=NULL placeholder →
--   RETURNING createdAt → compute hash → UPDATE within same transaction).
--
-- DB-level invariant for post-migration rows:
--   A DEFERRED constraint trigger fires at the end of each transaction and
--   raises an exception if any row whose seq > (the max seq at migration time)
--   still has a NULL log_hash. "Deferred" means it runs after the UPDATE in the
--   two-step insert, so the temporary NULL is never visible at commit time.
--   Pre-migration rows (seq <= cutoff) remain exempt so legacy data is untouched.
--
-- Verification strategy:
--   GET /api/audit/chain-status walks all rows by seq ASC. Rows before the
--   first hashed entry are treated as legacy and skipped. Any NULL logHash
--   after the chain has started is flagged as tampered.
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "seq" bigserial;
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "prev_log_hash" text;
ALTER TABLE "activity_log" ADD COLUMN IF NOT EXISTS "log_hash" text;

-- Prevent accidental empty-string logHash.
ALTER TABLE "activity_log" DROP CONSTRAINT IF EXISTS "activity_log_log_hash_not_empty";
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_log_hash_not_empty"
  CHECK (log_hash IS NULL OR length(log_hash) > 0);

-- Capture the current max seq so the trigger knows which rows are "legacy".
-- Rows at or below this seq value had no hash when the migration ran.
DO $$
DECLARE
  legacy_cutoff bigint;
BEGIN
  SELECT COALESCE(MAX(seq), 0) INTO legacy_cutoff FROM activity_log WHERE log_hash IS NULL;

  -- Create the trigger function, embedding the cutoff as a literal.
  EXECUTE format($func$
    CREATE OR REPLACE FUNCTION activity_log_hash_not_null_check()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      -- Only enforce for post-migration rows (seq > legacy cutoff).
      IF NEW.log_hash IS NULL AND NEW.seq > %s THEN
        RAISE EXCEPTION
          'activity_log.log_hash must not be NULL for post-migration rows (seq=%)', NEW.seq
          USING ERRCODE = 'not_null_violation';
      END IF;
      RETURN NEW;
    END;
    $body$
  $func$, legacy_cutoff);
END;
$$;

-- Drop existing trigger if any, then create as DEFERRABLE INITIALLY DEFERRED
-- so the check runs at COMMIT time (after the two-step insert's UPDATE).
DROP TRIGGER IF EXISTS "trg_activity_log_hash_not_null" ON "activity_log";
CREATE CONSTRAINT TRIGGER "trg_activity_log_hash_not_null"
  AFTER INSERT OR UPDATE ON "activity_log"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION activity_log_hash_not_null_check();
