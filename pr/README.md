# AIGovOps REPLAY — Roadmap Proposals

This folder is the prioritized backlog of proposed PRs for the AIGovOps REPLAY monorepo. Each file is a stand-alone proposal — title, why it matters, definition of done, scope boundaries, and the files it touches — sized so it can become a real pull request without further re-planning.

Numbering reflects **priority order**, not chronological order. Higher = more urgent.

## Priority buckets

- **CRITICAL** (`01–03`) — Data integrity gaps, abuse vectors, broken trust story. Ship these first.
- **URGENT** (`04–10`) — Known bugs, missing tests on trust-critical paths, security controls users expect.
- **GOOD TO HAVE** (`11–20`) — UX polish, marketing amplifiers, dev ergonomics. Ship when capacity allows.

## Index

| # | Priority | Title | Source task |
|---|----------|-------|-------------|
| 01 | CRITICAL | Audit-log hash chain backfill | #36 |
| 02 | CRITICAL | Audit-log hash chain backfill (duplicate of 01) | #50 |
| 03 | CRITICAL | Protect chain export endpoints from abuse | #41 |
| 04 | URGENT   | Automated tests for the audit-log chain | #37 |
| 05 | URGENT   | E2E tests for the Alerts page + webhook delivery | #47 |
| 06 | URGENT   | Replay & policy-check events in the e2e suite | #51 |
| 07 | URGENT   | Fix `policyStatus: 'error'` type mismatch on mobile | #39 |
| 08 | URGENT   | Owner-revocable share links | #44 |
| 09 | URGENT   | Auto-expire share links | #42 |
| 10 | URGENT   | Configurable email recipients for violation alerts | #45 |
| 11 | GOOD     | Live receipt count for anonymous visitors | #32 |
| 12 | GOOD     | Open Graph / Twitter share preview cards | #33 |
| 13 | GOOD     | Public verification links on receipt cards | #43 |
| 14 | GOOD     | Audit-log entry list on the Audit page | #38 |
| 15 | GOOD     | Live policy-violation feed | #46 |
| 16 | GOOD     | Surface rate-limit configuration in admin panel | #35 |
| 17 | GOOD     | "Error" filter option on receipts list | #34 |
| 18 | GOOD     | Mobile chain-screen export button | #40 |
| 19 | GOOD     | API build-size guard in CI | #48 |
| 20 | GOOD     | Auto-sync Expo packages | #49 |

## Status notes

- **01 + 02 are duplicates.** They came from different parent features (#26 and #31) and describe the same backfill work. They have been **consolidated under planning Task #53** (`Audit-log hash chain backfill (consolidates #36 + #50)`). When 01 is shipped, 02 should be closed as a duplicate.
- All 20 originate from PROPOSED follow-up tasks generated during earlier feature work; none are blocked by missing prerequisites — every parent feature is already merged.

## How to use this folder

1. Pick the highest-priority unshipped proposal.
2. Read the proposal and the existing parent feature it extends.
3. Open a feature branch named after the file (e.g. `pr/03-export-endpoint-abuse`).
4. Implement, ship, and link the resulting PR back to the proposal file in the merge commit.
