> **STATUS: DONE — merged via planning Task #53.**
  > Backfill landed on `main` in commit `b2364fd` (Audit-log hash chain
  > backfill — consolidates #36 + #50). Archived here for history. The
  > live audit chain is now intact end-to-end and `/audit/chain-status`
  > reports `mismatchedSeqs: []`. See the runbook in `replit.md`.

  # 01 — Audit-log hash chain backfill

- **Priority:** CRITICAL
- **Source task:** #36
- **Parent feature:** #26 Activity Log Integrity Hashing
- **Planning task:** #53 (consolidates #36 + #50)

## Why this matters

Pre-migration entries in `activity_log` still have `NULL` `log_hash` and `prev_log_hash`. The chain verifier walks rows in `seq ASC` and silently **skips** every NULL-hash row before it finds the first hashed one. That means a slice of audit history is invisible to the integrity check we promise users. Anyone who can write to the database can slip a tampered row into that gap and the audit endpoint will not flag it.

## Done looks like

- Every row in `activity_log` has non-null `log_hash` and `prev_log_hash`.
- `GET /audit/chain-status` walks the entire table from `seq = 1` and reports `total == hashableEntries` with `mismatches: []`.
- A backfill script lives in `@workspace/scripts` and supports `--dry-run` (reports counts and would-touch range without writing).
- Re-running the script is a no-op (idempotent).
- The migration's `legacy_cutoff` is lowered to `0` so the deferred NOT-NULL trigger now covers every row going forward.
- Regression tests assert: (a) backfill produces a fully-verifiable chain, (b) tampering one backfilled row's `summary` is detected, (c) second run touches zero rows.

## Out of scope

- Re-hashing receipts in the `interactions` table.
- Changing the hash formula or advisory-lock strategy.
- UI changes (covered by proposal 14).

## Approach

Wrap the backfill in `pg_advisory_xact_lock(0x4C4F4748)` so a concurrent insert cannot race the cutoff move. Walk pre-cutoff rows in `seq ASC`, compute each `log_hash` using `buildLogHash` from `crypto.ts` (do NOT re-implement — drift = silent corruption). Update both hash columns and the cutoff in the same transaction.

## Files of interest

- `lib/db/src/schema/interactions.ts:69-115`
- `lib/db/src/migrations/0001_add_activity_log_hash_chain.sql`
- `artifacts/api-server/src/lib/activity-log.ts`
- `artifacts/api-server/src/lib/crypto.ts:31-42`
- `artifacts/api-server/src/routes/audit.ts`
- `scripts/`
