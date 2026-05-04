# 14 — Live policy-violation feed

- **Priority:** GROWTH (nice-to-have)
- **Source task:** #46
- **Parent feature:** #29 Policy Violation Webhooks & Alerts

## Why this matters

Operators have no real-time signal when policy violations are happening. A live feed on the Alerts page lets ops watch the system during a deploy or incident without refreshing.

## Done looks like

- The Alerts page shows a streaming feed of recent violations (last hour by default).
- New violations appear at the top within ~5 seconds of mint.
- Each row links to the offending receipt's detail page.
- Empty state and load state are both designed.

## Out of scope

- Push notifications.
- Filters / saved views.

## Approach

Server-Sent Events from `GET /violations/stream` is simplest (no WS dependency). Falls back to 5-second polling if the browser/EventSource is unavailable. Reuse the existing rate-limit middleware so a misbehaving client can't pin a connection forever.

## Files of interest

- `artifacts/api-server/src/routes/`
- `artifacts/aigovops/src/pages/` — Alerts page
