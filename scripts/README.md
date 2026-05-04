# Scripts (`@workspace/scripts`)

Repository-wide utility scripts.

## Available scripts

| Command                | Source                               | Purpose                                   |
| ---------------------- | ------------------------------------ | ----------------------------------------- |
| `pnpm run test:spec`   | `src/check-spec-drift.ts`            | OpenAPI ↔ Express ↔ Zod drift checker     |

Both can be invoked from the repository root via the matching script in the
root `package.json` (e.g. `pnpm run test:spec`).

## `test:spec` — OpenAPI drift checker

Runs three stages and exits non-zero on any drift:

1. **Route drift** — boots the real Express app in `--print-routes` mode
   (a one-shot introspection mode that walks the live router stack and
   exits before binding a port) and compares the registered routes against
   the paths in `lib/api-spec/openapi.yaml`.  The api-server is rebuilt
   from source on every run so the route table reflects the current
   TypeScript, never a stale `dist/` artifact.  Set `SKIP_API_BUILD=1` to
   skip the rebuild when you know the bundle is already fresh.
2. **Schema export drift** — verifies that every operation with a
   requestBody or 2xx JSON response has the corresponding `{Prefix}Body`
   / `{Prefix}Response` Zod export in `lib/api-zod`.
3. **Schema shape drift** — for every component schema whose name matches
   a Zod export and for every operation whose response `$ref`s a named
   component (all methods, not just GET), field-compares property presence
   and required/optional status.

### `SPEC_EXEMPTIONS` — policy

A small, hardcoded set of routes are intentionally absent from the public
OpenAPI contract and therefore exempted from Stage 1:

- `POST /admin/login`, `POST /admin/logout`, `GET /admin/status` — admin
  panel session management.  These are operator surfaces, not part of
  the public API client SDK.
- `POST /ai/generate` — internal AI proxy endpoint used by the web app
  only; intentionally not advertised to third-party clients.

If you add a new internal route that should not appear in the public
contract, add it to the `SPEC_EXEMPTIONS` set in `check-spec-drift.ts`
with a comment explaining why.  All other routes must have an OpenAPI
entry — that is what the drift check enforces.

### Why not OpenAPI-first only?

Generating from the spec catches forward drift (spec adds an operation,
codegen runs, server doesn't implement it).  The runtime introspection
catches the reverse: a route added directly to Express that the spec
never learned about.  Both directions matter — the AIGovOps client SDK
is generated from the spec, so any route the server exposes but the spec
omits is invisible to type-safe consumers.
