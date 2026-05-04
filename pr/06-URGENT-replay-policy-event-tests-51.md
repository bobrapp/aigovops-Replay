# 06 — Replay & policy-check events in the e2e suite

- **Priority:** URGENT
- **Source task:** #51
- **Parent feature:** #31 CI Test Suite & OpenAPI Spec Drift Check

## Why this matters

The e2e suite covers receipt creation and verification, but `replay` and `policy_check` are first-class audit events that today are exercised only by hand. A regression that drops or mis-types either event would only surface in production — and would silently corrupt the audit chain because both events also write to `activity_log`.

## Done looks like

- E2E test mints a receipt, calls the replay endpoint, and asserts: (a) `replayCount` increments, (b) an `activity_log` row of `type: 'replayed'` is appended, (c) `chain-status` still reports intact.
- E2E test mints a violating receipt, asserts a `policy_check` `activity_log` row appears with `policyStatus: 'fail'` reflected on the receipt.
- Tests assert the new audit rows include valid `log_hash`/`prev_log_hash` linking to the previous head.

## Out of scope

- Webhook delivery for the policy-check event (covered by proposal 05).
- New event types.

## Approach

Add to `tests/e2e/tests/api.spec.ts` a new `describe("Replay + policy-check audit events")` block that builds on the existing OIDC login fixture.

## Files of interest

- `artifacts/api-server/src/routes/interactions.ts`
- `artifacts/api-server/src/lib/activity-log.ts`
- `tests/e2e/tests/api.spec.ts`
