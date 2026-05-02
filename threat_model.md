# Threat Model

## Project Overview

AIGovOps REPLAY is a TypeScript pnpm-workspace application that records AI prompt/response interactions as cryptographically hashed, hash-chained receipts. The production system consists of an Express 5 API server (`artifacts/api-server`), PostgreSQL via Drizzle ORM (`lib/db`), a React/Vite web client (`artifacts/aigovops`), and an Expo/mobile client (`artifacts/aigovops-mobile`). Users authenticate with Replit OIDC-backed sessions; browser clients use an HttpOnly `sid` cookie and mobile clients use an opaque bearer session token.

The mockup sandbox under `artifacts/mockup-sandbox` and build/helper scripts are development or build-time surfaces and are not production request handlers unless separately proven reachable in production. In production, `NODE_ENV` is assumed to be `production`, and Replit deployment TLS terminates HTTPS for client/server traffic.

## Assets

- **User accounts and sessions** -- Replit OIDC claims, opaque session IDs, browser session cookies, mobile bearer session tokens, access tokens, and refresh tokens stored in the server-side session table. Compromise enables account impersonation.
- **AI interaction contents** -- prompts, responses, model names, tags, and receipt metadata. Prompts/responses may contain proprietary code, user data, or other sensitive AI artifacts.
- **Receipt integrity evidence** -- prompt hashes, response hashes, previous hashes, chain hashes, replay records, and verification results. The product's core security claim depends on these values being append-only, correctly linked, and accurately verified.
- **Policy-as-code rules** -- policy rules, severities, enablement state, and violation counts. These influence governance outcomes and can affect how receipts are classified.
- **Application secrets** -- `DATABASE_URL`, OIDC configuration/secrets provided by the platform, `ADMIN_API_KEY`, API keys, and session contents in PostgreSQL.
- **Audit/activity data** -- activity log summaries and timestamps. These may reveal prompt excerpts or operational behavior.

## Trust Boundaries

- **Browser/mobile client to API** -- all requests to `/api/*` cross from untrusted clients into the Express server. The API must validate request bodies and enforce authentication/authorization server-side; generated clients and UI state are not trusted.
- **Authenticated user to other authenticated users** -- receipt contents and prompt-derived activity must be scoped to the owning user unless explicitly designed as public/global aggregate information.
- **Regular user to policy administrator** -- policy creation, update, deletion, and enablement must require an authenticated administrator and must not rely only on frontend controls.
- **API to PostgreSQL** -- the API has direct database access through Drizzle. Query construction must remain parameterized, pagination must be bounded, and chain append operations must preserve global integrity under concurrency.
- **API to Replit OIDC provider** -- login, callback, token refresh, and mobile token exchange rely on provider-issued tokens and PKCE/state/nonce validation. Redirect and origin handling must not let untrusted headers weaken this flow.
- **Policy rule evaluator boundary** -- policy rules originate from administrators but are still stored data interpreted by the server. The evaluator must remain a constrained parser/interpreter with no JavaScript code execution, filesystem, network, or process access.
- **Production vs development/build tooling** -- `artifacts/mockup-sandbox`, package build scripts, and local helper scripts are out of production runtime scope unless reachable from the deployed API/client.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/api-server/src/middlewares/*.ts`, `artifacts/api-server/src/lib/auth.ts`, `artifacts/api-server/src/lib/policy-eval.ts`, `artifacts/api-server/src/lib/crypto.ts`.
- Database schema and security-relevant assets: `lib/db/src/schema/auth.ts`, `lib/db/src/schema/interactions.ts`, `lib/db/src/index.ts`.
- Generated API contract/validators: `lib/api-spec/openapi.yaml`, `lib/api-zod/src/generated/api.ts`, `lib/api-client-react/src/custom-fetch.ts`.
- Production clients: `artifacts/aigovops/src`, `artifacts/aigovops-mobile/app`, `artifacts/aigovops-mobile/context/AuthContext.tsx`.
- Highest-risk areas: session/token handling, receipt access control, global stats/chain/activity responses, policy mutation/evaluation, chain append and verification, unbounded request/response sizes, and CORS/origin handling.
- Dev-only/low-priority areas: `artifacts/mockup-sandbox`, `artifacts/*/scripts`, generated `dist` outputs, `node_modules`, and local attached assets unless they are served or imported by production code.

## Threat Categories

### Spoofing

Users authenticate through Replit OIDC and server-side sessions. Browser sessions must use unpredictable HttpOnly cookies with secure attributes, mobile bearer tokens must be treated as secrets, and protected API routes must require `req.isAuthenticated()` before reading or mutating user data. Login callbacks must validate PKCE, state, nonce, and expected issuer/token claims.

### Tampering

Clients are untrusted and must not be able to modify receipts, replay counters, policy status, or policy rules outside authorized API paths. Receipt creation must derive `userId`, prompt/response hashes, previous hash, and chain hash server-side. Policy mutations must require administrator authorization, and policy rule validation must prevent stored rules from escaping the constrained evaluator.

### Information Disclosure

Prompt/response contents, activity summaries, and session tokens are sensitive. Receipt detail/list/replay/verify APIs must only expose a user's own receipts unless intentionally public. Aggregate endpoints such as stats, chain, activity, and policy listing must avoid leaking prompt excerpts, receipt IDs, hashes, or operational metadata across users. Error responses and logs must not expose secrets, raw tokens, or stack traces in production.

### Denial of Service

The API must bound JSON body sizes, list limits, offsets, expensive chain checks, policy rule length/evaluation cost, and request rates. Receipt creation, stats, chain verification, and replay endpoints can become expensive as the receipt table grows, so production controls must prevent unauthenticated or low-cost abuse from exhausting database, CPU, memory, or network resources.

### Elevation of Privilege

Regular authenticated users must not gain policy-administrator privileges or access other users' receipts through IDOR, global endpoints, reflected CORS credentials, or frontend-only checks. SQL injection, command injection, unsafe JavaScript evaluation, and path traversal must remain absent from production request paths. The policy evaluator must not expose `globalThis`, `process`, `require`, prototypes, constructors, or arbitrary function calls.
