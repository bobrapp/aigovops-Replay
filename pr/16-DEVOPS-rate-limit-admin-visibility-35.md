# 16 — Surface rate-limit configuration in the admin panel

- **Priority:** DEVOPS (internal hygiene)
- **Source task:** #35
- **Parent feature:** #25 Security Hardening Batch 2

## Why this matters

Rate limits are configured in code today (e.g. demo mint = 3/hour). Admins can't see what limits are in effect without reading source. A small read-only panel makes the security posture self-documenting.

## Done looks like

- The Admin page has a "Rate limits" section listing each rate-limited endpoint, its window, its cap, and (where tracked) recent hit counts.
- Section is read-only in v1 — no editing yet.
- A short tooltip on each entry explains the rationale ("anonymous demo mints capped to prevent abuse" etc.).

## Out of scope

- Editable limits (would require a config table + reload mechanism).
- Per-user / per-tenant limits.

## Approach

Add a single `GET /admin/rate-limits` endpoint that returns the in-memory rate-limit config registered at boot. Render in a small table.

## Files of interest

- `artifacts/api-server/src/lib/` — rate-limit middleware
- `artifacts/aigovops/src/pages/` — Admin page
