# End-to-end tests (`@workspace/e2e-tests`)

Playwright suite covering the AIGovOps REPLAY API, admin endpoints, and the
SPA chain view.

## Run

From the repository root:

```bash
pnpm run test:e2e
```

Or, equivalently, from this package:

```bash
pnpm --filter @workspace/e2e-tests run test
```

## What runs

`playwright.config.ts` declares two projects:

| Project   | Spec                          | Hermetic? | Requires                                                           |
| --------- | ----------------------------- | --------- | ------------------------------------------------------------------ |
| `api`     | `tests/api.spec.ts`           | yes       | nothing — global setup spawns its own API + mock OIDC server       |
| `browser` | `tests/proxy-browser.spec.ts` | no        | the Replit dev workflows (`aigovops: web`, `api-server`) to be up |

The `browser` project hits Replit's shared reverse-proxy at
`http://localhost:80`.  When that proxy is unreachable (e.g. running in a
clean CI checkout outside the Replit workspace), the `beforeAll` reachability
probe in `proxy-browser.spec.ts` skips the whole describe with a clear
message rather than failing — so `pnpm run test:e2e` is always a dependable
validation step.

## Prerequisites

The `api` project (always-on hermetic suite) needs:

- `DATABASE_URL` — a writable Postgres connection string.  Global setup
  truncates only e2e-scoped user rows it created, never your dev data.
- `playwright` browsers — on Replit these are sandbox-blocked by
  `playwright install`; the config falls back to the Nix-installed Chromium
  via `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

The `browser` project additionally needs:

- the `artifacts/aigovops: web` workflow running
- the `artifacts/api-server: API Server` workflow running

If both workflows are up, the browser suite proves the proxy → web bundle →
API path end-to-end.  If they are not, the suite skips itself with a
descriptive reason in the test output.

## Output

- `playwright-report/` — interactive HTML report (gitignored)
- `test-results/` — screenshots/traces on failure (gitignored)

Both directories are recreated on every run.

## Companion check

`pnpm run test:spec` (in `scripts/`) is the OpenAPI drift checker — it
catches contract drift that runtime e2e tests cannot, by comparing the
Express route table at runtime against `lib/api-spec/openapi.yaml` and the
generated `lib/api-zod` schemas.  Both should be kept green together.
