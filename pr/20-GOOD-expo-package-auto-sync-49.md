# 20 — Auto-sync Expo packages

- **Priority:** GOOD TO HAVE
- **Source task:** #49
- **Parent feature:** #30 Mobile Package Updates & API Bundle Trim

## Why this matters

Expo SDK upgrades pin compatible versions for first-party packages. When those drift (e.g. dev upgrades a single Expo package via `pnpm add` instead of `expo install`), the dev server prints noisy version-mismatch warnings and occasionally produces hard-to-diagnose runtime issues.

## Done looks like

- A `scripts/src/check-expo-versions.ts` runs `npx expo-doctor` (or equivalent) and fails if any version warnings are emitted.
- The check runs in CI on PRs that touch `artifacts/aigovops-mobile/package.json`.
- A short doc note in `replit.md` (or the mobile README) tells contributors to use `npx expo install <pkg>` for Expo-managed packages.

## Out of scope

- Auto-bumping Expo SDK major versions.

## Approach

Wrap `expo-doctor` invocation in a small script and register as a validation step.

## Files of interest

- `artifacts/aigovops-mobile/package.json`
- `scripts/`
- `replit.md`
