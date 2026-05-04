# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Project: AIGovOps REPLAY

A cryptographically signed receipt system for every AI interaction. Every prompt/response pair gets a SHA-256 hash-chained receipt that can be verified, replayed, and checked against policy-as-code rules.

### Features
- **Mint Receipts**: Submit AI interactions to create cryptographically signed, hash-chained receipts
- **Hash Chain**: Each receipt links to the previous via chain hash (tamper-evident append-only log)
- **Verify**: Cryptographic verification of prompt/response/chain hashes
- **Replay**: One-click replay of any interaction with output diff comparison
- **Policies**: Policy-as-code rules (JS expressions) evaluated on every new receipt
- **Dashboard**: Live stats, chain health, recent activity

### Crypto
- `promptHash = sha256("prompt:" + prompt)`
- `responseHash = sha256("response:" + response)`
- `chainHash = sha256("chain:" + promptHash + ":" + responseHash + ":" + prevHash|GENESIS)`

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## DB Tables
- `interactions` — AI interaction receipts with crypto hashes
- `policies` — Policy-as-code rules (JS expressions)
- `activity_log` — Audit trail of all events. Hash-chained via `log_hash` /
  `prev_log_hash`. The 0001 migration left pre-migration rows with NULL
  hashes that the verification walker silently skipped. Run the backfill
  (below) once per environment to repair the chain end-to-end.

## Operator Runbook — Audit-log hash chain backfill

Closes the legacy NULL-hash gap and pins the deferred NOT-NULL trigger to
`seq > 0` (covers every row going forward). Idempotent — safe to re-run.

```bash
# Dry-run first (always): reports counts + first/last seq it would touch.
pnpm --filter @workspace/scripts run backfill:audit-log -- --dry-run

# Apply: rewrites drifted rows in a single advisory-locked transaction
# and lowers the trigger cutoff to 0.
pnpm --filter @workspace/scripts run backfill:audit-log
```

Success looks like: `applied: true`, `nullHashRows: 0` on a second pass,
and `GET /api/audit/chain-status` returning `intact: true` with `tampered: 0`
and `total === hashableEntries`.

Implementation: `lib/db/src/audit-log-backfill.ts` (the function) and
`scripts/src/audit-log-backfill.ts` (the CLI). `buildLogHash` is exported
from `@workspace/db` so the runtime insert path and the backfill share one
canonical formula.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
