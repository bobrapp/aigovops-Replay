# 04 — Auto-expire share links

- **Priority:** CRITICAL
- **Source task:** #42
- **Parent feature:** #28 Public Verification Links & Chain Health

## Why this matters

Share tokens already carry an `expires_at` timestamp, but expired rows live in the table forever and are still queryable in admin views. We want a sweep that physically deletes them so old links truly stop working and we don't accumulate dead rows.

## Done looks like

- A small periodic job (every 1 hour suggested) deletes `share_tokens` rows where `expires_at < now() - INTERVAL '24 hours'` (small grace window so a clock-skew client briefly seeing a 404 instead of a meaningful "expired" message can be diagnosed).
- The public verify endpoint returns a clear "this link has expired" 410 (not just 404) when `expires_at <= now()` and the row hasn't been swept yet.
- E2E test creates a token with a past `expires_at`, asserts public verify returns 410, runs the sweep, asserts the row is gone.

## Out of scope

- Email notifications when a share link expires.
- Configurable per-token TTL (covered by the existing share-token creation flow).

## Approach

Reuse the in-process worker pattern from `webhook-worker.ts` — start a `setInterval` from `index.ts` after `app.listen`. Single SQL `DELETE`. Unit test the function in isolation.

## Files of interest

- `artifacts/api-server/src/lib/webhook-worker.ts` — pattern to mirror
- `artifacts/api-server/src/index.ts:79` — boot-time start point
- `lib/db/src/schema/interactions.ts:133-150` (`share_tokens`)
