# 17 — API build-size guard in CI

- **Priority:** DEVOPS (internal hygiene)
- **Source task:** #48
- **Parent feature:** #30 Mobile Package Updates & API Bundle Trim

## Why this matters

Cold-start time scales with bundle size. A drift-by-megabytes regression typically slips in via a single `import * as foo from "huge-pkg"`. A simple CI guardrail catches it the same day.

## Done looks like

- A new validation step runs `pnpm --filter @workspace/api-server run build` and fails if `dist/index.mjs` exceeds a configured threshold (suggested: `2.0 MiB`, with current size + 10% headroom).
- The threshold is stored in a tracked config file so increases are an explicit, reviewable change.
- CI prints `current / threshold / delta-since-main` on each run.

## Out of scope

- Per-route bundle splitting.
- Frontend bundle size (separate concern).

## Approach

Add a small `scripts/src/check-api-bundle-size.ts` that runs after build, registered as a validation step. Threshold lives in `scripts/api-bundle-size.json`.

## Files of interest

- `artifacts/api-server/`
- `scripts/`
