# 05 — E2E tests for the Alerts page + webhook delivery

- **Priority:** URGENT
- **Source task:** #47
- **Parent feature:** #29 Policy Violation Webhooks & Alerts

## Why this matters

Webhooks fire silently in the background. If delivery breaks (signature mismatch, retry-loop bug, payload schema drift), no one notices until a customer asks why their on-call channel went quiet. The Alerts page is the primary recovery UI when a delivery fails — it must keep working through every refactor.

## Done looks like

- E2E test creates a webhook endpoint, mints a violating receipt, and asserts a `webhook_deliveries` row appears with `status: pending → delivered`.
- E2E test asserts the HMAC signature on the delivered payload matches `HMAC-SHA256(secret, body)`.
- E2E test simulates a failing target (returns 500), asserts retry happens up to `MAX_WEBHOOK_ATTEMPTS`, and final state is `failed`.
- E2E test loads the Alerts page in the browser, asserts the failed delivery is listed and the "retry" action transitions it back to `pending`.

## Out of scope

- Email-delivery alerts (covered by proposal 10).
- Real outbound HTTP — tests use a mock HTTP server scoped to the test process.

## Approach

Spawn a tiny `http.createServer` in the test as the webhook target so we have full control over status codes and can inspect signature headers. Reuse the OIDC mock pattern already in `global-setup.ts`.

## Files of interest

- `artifacts/api-server/src/lib/webhook-worker.ts`
- `artifacts/aigovops/src/pages/alerts.tsx` (or wherever Alerts page lives)
- `tests/e2e/tests/api.spec.ts`
- `tests/e2e/tests/proxy-browser.spec.ts`
