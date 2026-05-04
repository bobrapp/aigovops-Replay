# 04 — Automated tests for the audit-log chain

- **Priority:** URGENT
- **Source task:** #37
- **Parent feature:** #26 Activity Log Integrity Hashing

## Why this matters

The audit-log chain has zero regression coverage today. The only existing assertion is "the endpoint returns a number for `total`". Any future change to insert ordering, hash formula, or the verifier walk could silently break tamper detection and we'd never know until a customer's chain failed an audit.

## Done looks like

- A test inserts a clean sequence of audit-log rows and asserts `chain-status` returns `intact: true, mismatches: []`.
- A test corrupts a single row's `summary` field and asserts `chain-status` flags exactly that row's `seq`.
- A test rewrites a single row's `prev_log_hash` to a wrong value and asserts the link check catches it.
- A test deletes a middle row and asserts the next row's link check fails.
- All tests run in the existing e2e Playwright suite under the admin auth context.

## Out of scope

- Backfill behavior (covered by proposal 01).
- UI surfacing (covered by proposal 14).

## Approach

Add a new spec file `tests/e2e/tests/audit-chain.spec.ts`. Use a direct `pg.Pool` connection (DATABASE_URL is already in the test env) to manipulate rows after authenticating as admin. Each test cleans up its mutations in an `afterEach`.

## Files of interest

- `artifacts/api-server/src/routes/audit.ts`
- `tests/e2e/tests/api.spec.ts`
- `tests/e2e/src/global-setup.ts`
