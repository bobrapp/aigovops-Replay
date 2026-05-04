# 15 — "Error" filter option on the receipts list

- **Priority:** GROWTH (nice-to-have)
- **Source task:** #34
- **Parent feature:** #25 Security Hardening Batch 2

## Why this matters

The receipts list filters by policy status: `all | pass | fail | pending`. The schema also supports `error` (policy evaluator failure), but there's no filter for it — so admins can't quickly find receipts where their policy code itself crashed.

## Done looks like

- The receipts list filter dropdown adds `error` as an option.
- Selecting it returns receipts with `policyStatus = 'error'`.
- Empty state copy explains: "No policy-evaluator errors in the current view."

## Out of scope

- Drilling into the underlying evaluator stack trace (separate work).

## Approach

Add `error` to the existing filter union (frontend) and enum acceptance (backend list endpoint).

## Files of interest

- `artifacts/aigovops/src/components/` — receipts list filter
- `artifacts/api-server/src/routes/` — interactions list handler
- `lib/api-spec/openapi.yaml`
