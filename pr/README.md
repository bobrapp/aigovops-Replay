# AIGovOps REPLAY — Roadmap Proposals

  This folder is the prioritized backlog of proposed PRs for the AIGovOps REPLAY monorepo. Each file is a stand-alone proposal — title, why it matters, definition of done, scope boundaries, and the files it touches — sized so it can become a real pull request without further re-planning.

  Numbering reflects **priority order**, not chronological order. Lower number = ship sooner.

  ## How items are grouped

  Items are grouped into four batches of ~5 so a small team can take one batch at a time:

  - **Batch 1 — CRITICAL (`01–05`)** — Abuse vectors on the now-anonymous app, correctness bugs, and zero-coverage paths on the trust story. Ship before any further public push.
  - **Batch 2 — URGENT (`06–10`)** — Missing test coverage on alerting and replay flows, configurability gaps that make existing features less useful, and admin/mobile parity. Ship next.
  - **Batch 3 — GROWTH (`11–15`)** — Public-facing polish that converts the new anonymous traffic into trust signals and inbound shares. Ship when batch 2 is in flight.
  - **Batch 4 — DEVOPS (`16–18`)** — Internal hygiene. Pick up between feature batches.

  ## Index

  ### Batch 1 — CRITICAL — ship first

  | # | Title | Source task | Parent feature |
  |---|-------|-------------|----------------|
  | 01 | Protect chain export endpoints from abuse                     | #41 | #27 Portable Chain Export |
  | 02 | Fix `policyStatus: 'error'` type mismatch on mobile           | #39 | #27 Portable Chain Export |
  | 03 | Owner-revocable share links                                   | #44 | #28 Public Verification Links |
  | 04 | Auto-expire share links                                       | #42 | #28 Public Verification Links |
  | 05 | Automated tests for the audit-log chain                       | #37 | #26 Activity Log Integrity Hashing |

  ### Batch 2 — URGENT — ship next

  | # | Title | Source task | Parent feature |
  |---|-------|-------------|----------------|
  | 06 | E2E tests for the Alerts page + webhook delivery              | #47 | #29 Policy Violation Webhooks |
  | 07 | Replay & policy-check events in the e2e suite                 | #51 | #31 CI Test Suite & Spec Drift |
  | 08 | Configurable email recipients for violation alerts            | #45 | #29 Policy Violation Webhooks |
  | 09 | Audit-log entry list on the Audit page                        | #38 | #26 Activity Log Integrity Hashing |
  | 10 | Mobile chain-screen export button                             | #40 | #27 Portable Chain Export |

  ### Batch 3 — GROWTH — ship when batch 2 is in flight

  | # | Title | Source task | Parent feature |
  |---|-------|-------------|----------------|
  | 11 | Live receipt count for anonymous visitors                     | #32 | #24 Hero & Landing Redesign |
  | 12 | Open Graph / Twitter share preview cards                      | #33 | #24 Hero & Landing Redesign |
  | 13 | Public verification links on receipt cards                    | #43 | #28 Public Verification Links |
  | 14 | Live policy-violation feed                                    | #46 | #29 Policy Violation Webhooks |
  | 15 | "Error" filter option on receipts list                        | #34 | #25 Security Hardening Batch 2 |

  ### Batch 4 — DEVOPS — pick up between feature batches

  | # | Title | Source task | Parent feature |
  |---|-------|-------------|----------------|
  | 16 | Surface rate-limit configuration in admin panel               | #35 | #25 Security Hardening Batch 2 |
  | 17 | API build-size guard in CI                                    | #48 | #30 Mobile Pkg Updates & API Trim |
  | 18 | Auto-sync Expo packages                                       | #49 | #30 Mobile Pkg Updates & API Trim |

  ## Why this order — what changed since the original plan

  The original numbering was written before two facts on the ground:

  1. **The mobile app no longer requires login** (commit `0ddcc5a`). The web app already exposes a no-login demo gallery + BYOAI mint (Task #52). Anything that touches a public surface — exports, share links, public stats — is now a higher abuse risk than it was when those endpoints sat behind auth.
  2. **The audit-log hash chain backfill is shipped** (Task #53, commit `b2364fd`). Proposals 01 and 02 in the original plan (#36 and #50) were two views of the same backfill work and are now both done.

  That recasts the priority order:

  - **Promoted to CRITICAL:**
    - #41 (export abuse protection) → top, because the demo gallery + anonymous mobile both call the export endpoints.
    - #39 (mobile `policyStatus: 'error'` type mismatch) → CRITICAL, because the type contract between server and mobile is silently wrong and the mobile app is now the primary unauthenticated surface.
    - #44 + #42 (share-link revocation + auto-expiry) → CRITICAL together, because anonymous users are about to start generating shareable URLs and we cannot un-share them today.
    - #37 (audit-log chain tests) → CRITICAL, because the chain backfill that just shipped has zero regression coverage and any future change could silently break tamper detection.
  - **Promoted to URGENT:**
    - #38 (audit-log entry list UI) → admins need to see the chain status, not just trust the verifier score.
    - #40 (mobile chain export) → mobile parity; the web app already exports.
  - **Demoted to GROWTH:** all the original `GOOD` items remain in their tier; renamed for clarity.
  - **Carved out DEVOPS:** internal hygiene items (#35, #48, #49) split out so feature batches stay focused.
  - **Done — archived to `pr/done/`:** #36 + #50 (both folded into the merged Task #53). See `pr/done/` for the original proposals with a status banner.

  ## Status notes

  - Every parent feature this backlog extends is already merged (#24–#31 + #52 + #53), so no item is blocked by a missing prerequisite.
  - All 18 active items originate from PROPOSED follow-up tasks on the project task queue (#32–#51, minus #36/#50). Updating this folder does not move them out of the PROPOSED state — that still needs explicit approval.

  ## How to use this folder

  1. Pick the highest-priority unshipped proposal in the current batch.
  2. Read the proposal and the existing parent feature it extends.
  3. Open a feature branch named after the file (e.g. `pr/01-export-endpoint-abuse`).
  4. Implement, ship, and link the resulting PR back to the proposal file in the merge commit. When complete, move the file into `pr/done/` with a status banner pointing at the merge commit.
  