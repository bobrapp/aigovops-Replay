> **STATUS: DONE — merged via planning Task #53.**
  > Backfill landed on `main` in commit `b2364fd` (Audit-log hash chain
  > backfill — consolidates #36 + #50). Archived here for history. The
  > live audit chain is now intact end-to-end and `/audit/chain-status`
  > reports `mismatchedSeqs: []`. See the runbook in `replit.md`.

  # 02 — Audit-log hash chain backfill (duplicate of 01)

- **Priority:** CRITICAL
- **Source task:** #50
- **Parent feature:** #31 CI Test Suite & OpenAPI Spec Drift Check
- **Status:** **Duplicate of proposal 01.** Should close as duplicate when 01 ships.

## Why this matters

Same gap as proposal 01: pre-migration `activity_log` rows have `NULL` hashes and the verifier skips them, leaving a slice of audit history outside the tamper-evidence story.

This proposal was created from the CI/test parent (#31) while proposal 01 was created from the activity-log parent (#26). Both describe identical backfill work.

## Done looks like

Same as proposal 01.

## Resolution plan

- Implement once via planning task #53 (which consolidates both).
- When the resulting PR merges, close this proposal with a note pointing at the merged commit.

## Files of interest

See proposal 01.
