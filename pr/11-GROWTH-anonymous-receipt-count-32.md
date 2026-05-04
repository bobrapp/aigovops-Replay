# 11 — Live receipt count for anonymous visitors

- **Priority:** GROWTH (nice-to-have)
- **Source task:** #32
- **Parent feature:** #24 Hero & Landing Page Redesign

## Why this matters

We just shipped the no-login demo gallery + BYOAI mint flow. A live "X receipts minted" counter on the hero converts that traffic into a stronger trust signal — the chain is real, growing, and visible without an account.

## Done looks like

- A small count badge near the hero CTA shows the total receipt count, refreshed every 60 seconds (cached server-side to avoid hammering the DB).
- The number formats nicely (`1.2k`, `12.4k`, `1.05M`).
- A skeleton state covers the first paint so the layout doesn't shift.
- The count includes the demo-public chain plus all authenticated mints.

## Out of scope

- Per-region or per-time-window breakdowns.
- Real-time push updates (60s poll is enough).

## Approach

Add `GET /public/stats/receipt-count` returning `{ total: number, asOf: string }` cached for 60s in-process. Wire to the existing `<Hero />` component.

## Files of interest

- `artifacts/aigovops/src/components/` — Hero
- `artifacts/api-server/src/routes/`
- `lib/api-spec/openapi.yaml`
