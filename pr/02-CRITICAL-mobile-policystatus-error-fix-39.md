# 02 — Fix `policyStatus: 'error'` type mismatch on mobile

- **Priority:** CRITICAL
- **Source task:** #39
- **Parent feature:** #27 Portable Chain Export

## Why this matters

The shared schema (`lib/db/src/schema/interactions.ts`) lists `'error'` as a valid `policyStatus` enum value, but the mobile receipt components only accept `'pass' | 'fail' | 'pending'`. The first time the API actually returns `'error'` for a receipt, the mobile screen will crash or render an undefined branch — a real shipping bug.

## Done looks like

- Mobile receipt components accept all four `policyStatus` values: `pass`, `fail`, `pending`, `error`.
- A clear visual treatment is added for `error` (suggested: amber dot + "Policy check errored" tooltip — not red, since it's an evaluator failure, not a content failure).
- TypeScript no longer permits the narrower three-value union anywhere on mobile.
- A small Jest/Vitest unit test covers each enum branch's rendering.

## Out of scope

- Web app — the web type is already correct.
- Re-running policy checks for receipts in the `error` state.

## Approach

Replace the locally-defined union types in mobile components with the type imported from `@workspace/db` (or the API-zod export, whichever the mobile app already consumes).

## Files of interest

- `artifacts/aigovops-mobile/src/components/` — receipt card / chain row components
- `lib/db/src/schema/interactions.ts:6` — `policyStatusEnum`
