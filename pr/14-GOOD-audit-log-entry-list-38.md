# 14 — Audit-log entry list on the Audit page

- **Priority:** GOOD TO HAVE
- **Source task:** #38
- **Parent feature:** #26 Activity Log Integrity Hashing

## Why this matters

The Audit page currently shows a "chain-status" summary (intact / total / tampered) but no actual rows. Admins can't see what events occurred or scan for unexpected entries. A simple paginated list closes that visibility gap.

## Done looks like

- New section on the Audit page lists recent `activity_log` rows: type, interaction id, summary, created_at, hash status (hashed / legacy / tampered).
- Pagination (50 per page) ordered by `seq DESC` so newest events appear first.
- Filter by event type (`created`, `replayed`, `verified`, `policy_check`) and by hash status.
- Uses the existing admin auth — no new auth surface.

## Out of scope

- Search by interaction id (proposal 14b for later).
- CSV export of audit log entries.

## Approach

Extend `GET /audit/chain-status` or add `GET /audit/entries?cursor=...&type=...` returning paginated rows with derived `hashStatus`. Update OpenAPI spec.

## Files of interest

- `artifacts/api-server/src/routes/audit.ts`
- `artifacts/aigovops/src/pages/` — Audit page
- `lib/api-spec/openapi.yaml`
