# Threat Model

## Project Overview

AIGovOps REPLAY is a TypeScript pnpm monorepo that provides a React/Vite frontend and an Express 5 API for recording AI prompt/response interactions as SHA-256 hash-chained receipts. The API persists receipts, policy-as-code rules, and activity log entries in PostgreSQL through Drizzle ORM. Production-relevant packages are `artifacts/api-server`, `artifacts/aigovops`, and shared libraries under `lib/*`.

## Assets

- **AI interaction receipts** -- prompts, responses, model identifiers, user IDs, tags, hashes, replay metadata, and policy violation details. These may contain sensitive user or business data and are the core audit evidence the application protects.
- **Policy rules** -- user-created policy-as-code expressions that influence receipt validation status and violation counters. Unauthorized changes can undermine governance results.
- **Receipt chain integrity** -- `promptHash`, `responseHash`, `prevHash`, and `chainHash` values used to provide tamper-evidence across records.
- **Database and application secrets** -- `DATABASE_URL`, database credentials, and deployment environment variables available to the API process.
- **Activity log** -- audit trail entries that record creation, verification, and replay events.

## Trust Boundaries

- **Browser / API boundary** -- all requests to `/api/*` cross from an untrusted client into the Express server. The server must not trust client-side validation, client-supplied user IDs, or client-supplied policy expressions.
- **Public / protected API boundary** -- receipt creation, replay, policy creation/update/deletion, and full prompt/response reads are sensitive operations and require server-side authentication/authorization if deployed beyond a public demo dataset.
- **API / PostgreSQL boundary** -- the API can read and write all receipt, policy, and activity data. Queries must remain parameterized, and attacker-controlled input must not become executable SQL or server code.
- **Policy rule execution boundary** -- policy strings stored in the database are untrusted data unless only trusted administrators can create them and they are evaluated in a hardened sandbox. Executing these strings inside the API process crosses a high-risk code execution boundary.
- **Production / development boundary** -- `artifacts/mockup-sandbox`, attached assets, generated caches, and Vite dev tooling are development-only unless proven reachable in production. Production deployments assume `NODE_ENV=production`, Replit-provided TLS, and no reliance on local mockup preview behavior.

## Scan Anchors

- **Production API entry points:** `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`, `artifacts/api-server/src/routes/interactions.ts`, `artifacts/api-server/src/routes/policies.ts`, `artifacts/api-server/src/routes/health.ts`.
- **Frontend/API clients:** `artifacts/aigovops/src/App.tsx`, `artifacts/aigovops/src/pages/**`, `lib/api-client-react/src/custom-fetch.ts`, generated hooks in `lib/api-client-react/src/generated/api.ts`.
- **Data model and validation:** `lib/db/src/schema/interactions.ts`, `lib/db/src/index.ts`, `lib/api-zod/src/generated/api.ts`, `lib/api-spec/openapi.yaml`.
- **High-risk areas:** policy rule storage and evaluation, unauthenticated mutating API routes, receipt chain computation/replay, unbounded list/read operations that return prompts and responses.
- **Usually out of scope:** `artifacts/mockup-sandbox/**`, `attached_assets/**`, `node_modules/**`, generated `dist/**`/cache files, and Vite dev-only plugins unless production reachability is demonstrated.

## Threat Categories

### Spoofing

The API currently accepts client-supplied `userId` values for receipt creation. In production, any identity attached to an interaction must come from a validated server-side session or token, not from a request body. Protected endpoints must authenticate every request that creates, modifies, replays, or reads sensitive receipt data.

### Tampering

Receipts, policy rules, violation counters, replay counts, and activity logs must only be modified by authorized actors. Policy rule management must be limited to trusted administrators or equivalent privileged principals, because policy changes directly affect governance outcomes. Hash-chain values must be computed server-side and chain verification must detect broken links across the relevant full chain, not only isolated records.

### Information Disclosure

Prompts and responses can contain PII, confidential business data, or proprietary AI outputs. API responses that list or retrieve interactions must be authorized and scoped to the requesting user or organization. Error responses and logs must avoid leaking secrets, full prompts, full responses, or database internals.

### Denial of Service

Public endpoints that create receipts, replay interactions, verify chains, list receipts, and evaluate policy rules can consume CPU, memory, and database resources. Request body sizes, pagination limits, policy execution time, and expensive verification paths must be bounded. User-controlled policy rules must not be able to run infinite loops or process-terminating code.

### Elevation of Privilege

Policy expressions are executable server-side logic if evaluated with JavaScript primitives such as `new Function`. Untrusted users must never be able to create or modify code that runs inside the API process. If policy-as-code is required, rules must be constrained to a safe DSL or evaluated in a sandbox with strict capability, time, memory, and module/network access controls.
