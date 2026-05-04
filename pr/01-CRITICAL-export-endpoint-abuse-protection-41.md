# 01 — Protect chain export endpoints from abuse

- **Priority:** CRITICAL
- **Source task:** #41
- **Parent feature:** #27 Portable Chain Export

## Why this matters

The chain-export endpoints stream the full receipt history. Now that we've opened up anonymous demo traffic, an unbounded export endpoint is an obvious DoS / scraping vector — a single attacker can request multi-MB exports in a tight loop and either exhaust CPU/memory or fill our bandwidth budget. We need both a request rate limit and a per-export row cap before this becomes a customer-impacting incident.

## Done looks like

- Export endpoints enforce a per-IP rate limit (suggested: `5 / hour` for anonymous, `30 / hour` for authenticated).
- Each export response is capped at a maximum row count (suggested: `5000`); responses near the cap include a `truncated: true` flag and the next-cursor seq so the caller can paginate.
- 429 responses include a `Retry-After` header.
- Tests cover: rate-limit hit returns 429, cap enforcement returns truncated payload with cursor, paginated continuation works.

## Out of scope

- Building an export billing tier.
- Rate-limiting the receipt-create path (already covered).

## Approach

Reuse the existing per-IP rate-limit middleware used by `POST /demo/mint` (3/hr cap pattern). Add a row-count cap in the export query (`LIMIT N+1`) and emit `truncated: true` + `nextCursor: row[N].seq` when the extra row is present.

## Files of interest

- `artifacts/api-server/src/routes/` — export route handler(s)
- `artifacts/api-server/src/routes/demo.ts` — existing rate-limit pattern to mirror
- `lib/api-spec/openapi.yaml` — add `truncated` / `nextCursor` to the export response schema
