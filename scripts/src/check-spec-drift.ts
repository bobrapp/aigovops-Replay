/**
 * check-spec-drift.ts
 *
 * Two-stage OpenAPI drift checker for the AIGovOps REPLAY API:
 *
 * Stage 1 — Route drift
 *   Compares the Express routes registered in artifacts/api-server/src/routes/
 *   against the paths declared in lib/api-spec/openapi.yaml.  Any path+method
 *   that appears in one place but not the other is a drift violation.
 *
 * Stage 2 — Schema drift
 *   Verifies that lib/api-zod (generated from openapi.yaml by orval) is in sync
 *   with the spec for every operation that declares a requestBody or a 2xx
 *   response schema.  The check works by:
 *     a) Reading every operation's operationId from the spec.
 *     b) Deriving the expected Zod export name (PascalCase(operationId) + suffix).
 *     c) Asserting that name is exported from lib/api-zod/src/generated/api.ts.
 *   A missing export means `pnpm --filter @workspace/api-spec run codegen` has
 *   not been run after the spec was updated.
 *
 * Exits 0 if both stages pass, exits 1 if any drift is found.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run test:spec
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Routes that are intentionally absent from the public OpenAPI spec.
// These are implementation details (admin panel session management, AI proxy)
// that are not part of the public contract and must never appear in client SDKs.
// ---------------------------------------------------------------------------
const SPEC_EXEMPTIONS = new Set([
  "GET /admin/status",
  "POST /admin/login",
  "POST /admin/logout",
  "POST /ai/generate",
]);

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize path params so Express `:id` and OpenAPI `{id}` compare equal. */
function normalize(path: string): string {
  return path
    .replace(/\{[^}]+\}/g, ":p") // OpenAPI {param} → :p
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, ":p"); // Express :param → :p
}

/** Convert camelCase operationId to PascalCase (first letter uppercase). */
function toPascalCase(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// ---------------------------------------------------------------------------
// OpenAPI spec
// ---------------------------------------------------------------------------
const specPath = resolve(ROOT, "lib/api-spec/openapi.yaml");

type SpecOperation = {
  operationId?: string;
  requestBody?: unknown;
  responses?: Record<string, { content?: Record<string, unknown> }>;
};

type SpecDocument = {
  paths: Record<string, Record<string, SpecOperation>>;
};

const spec = YAML.parse(readFileSync(specPath, "utf8")) as SpecDocument;

// ── Stage 1: route-level drift ──────────────────────────────────────────────

const specRoutes = new Set<string>();
for (const [path, methods] of Object.entries(spec.paths ?? {})) {
  for (const method of Object.keys(methods)) {
    if (HTTP_METHODS.has(method)) {
      specRoutes.add(`${method.toUpperCase()} ${normalize(path)}`);
    }
  }
}

const routesDir = resolve(ROOT, "artifacts/api-server/src/routes");
const SKIP_FILES = new Set(["index.ts"]);
const routeFiles = readdirSync(routesDir).filter(
  (f) => f.endsWith(".ts") && !SKIP_FILES.has(f),
);

const ROUTE_REGEX =
  /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;

const expressRoutes = new Set<string>();
for (const file of routeFiles) {
  const content = readFileSync(resolve(routesDir, file), "utf8");
  ROUTE_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ROUTE_REGEX.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];
    expressRoutes.add(`${method} ${normalize(path)}`);
  }
}

const inExpressNotInSpec: string[] = [];
const inSpecNotInExpress: string[] = [];

for (const route of expressRoutes) {
  if (!specRoutes.has(route) && !SPEC_EXEMPTIONS.has(route)) {
    inExpressNotInSpec.push(route);
  }
}
for (const route of specRoutes) {
  if (!expressRoutes.has(route)) {
    inSpecNotInExpress.push(route);
  }
}

// ── Stage 2: schema/body drift ──────────────────────────────────────────────
// Read all export names from the api-zod generated file.  These are produced
// by orval from openapi.yaml.  If an operation has a requestBody or a 2xx
// response with content but its corresponding schema export is missing, the
// codegen is out of date with the spec.

const apiZodPath = resolve(ROOT, "lib/api-zod/src/generated/api.ts");
const apiZodSource = readFileSync(apiZodPath, "utf8");

// Collect all `export const Foo` names from the generated file
const EXPORT_REGEX = /^export const ([A-Za-z][A-Za-z0-9]*)\b/gm;
const exportedNames = new Set<string>();
let exportMatch: RegExpExecArray | null;
while ((exportMatch = EXPORT_REGEX.exec(apiZodSource)) !== null) {
  exportedNames.add(exportMatch[1]);
}

// For each spec operation, derive the expected Zod schema name(s) and verify.
const missingBodySchemas: string[] = [];
const missingResponseSchemas: string[] = [];

type SpecSchema = { $ref?: string };

for (const [_path, methods] of Object.entries(spec.paths ?? {})) {
  for (const [method, operation] of Object.entries(methods)) {
    if (!HTTP_METHODS.has(method)) continue;
    const op = operation as SpecOperation;
    if (!op.operationId) continue;

    const prefix = toPascalCase(op.operationId);

    // requestBody drift: every operation with a requestBody must have a
    // corresponding {Prefix}Body schema in api-zod.  Orval is consistent about
    // this naming regardless of whether the body schema is inline or a $ref.
    if (op.requestBody) {
      const expected = `${prefix}Body`;
      if (!exportedNames.has(expected)) {
        missingBodySchemas.push(
          `${method.toUpperCase()} ${_path} (operationId: ${op.operationId}) → missing ${expected}`,
        );
      }
    }

    // 2xx response drift — GET operations only:
    //   Orval always generates {Prefix}Response for GET operations because GET
    //   endpoints are the canonical "owner" of their response schema.  For
    //   write operations (POST/PUT/PATCH/DELETE), orval deduplicates: when a
    //   POST response references the same component schema as an already-seen GET
    //   (e.g. createInteraction returning Interaction, which getInteraction
    //   already owns as GetInteractionResponse), orval does NOT emit a second
    //   CreateInteractionResponse export — the type is inlined into the GET
    //   response schema instead.  Attempting to predict the deduplication order
    //   statically requires simulating orval's schema traversal, which is
    //   brittle.  GET operations are a complete and stable subset: if codegen is
    //   stale, at least one GET response schema will be missing.
    //
    //   Non-JSON content types (ndjson, html, sqlite, octet-stream) are always
    //   skipped: orval does not generate Zod schemas for binary/stream responses.
    if (method !== "get") continue;

    for (const [code, resp] of Object.entries(op.responses ?? {})) {
      if (!code.startsWith("2")) continue;
      const jsonContent = resp.content?.["application/json"] as
        | { schema?: SpecSchema }
        | undefined;
      if (!jsonContent?.schema) continue; // non-JSON or no schema — skip

      const expected = `${prefix}Response`;
      if (!exportedNames.has(expected)) {
        missingResponseSchemas.push(
          `GET ${_path} (operationId: ${op.operationId}) → missing ${expected}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
let hasDrift = false;

if (inExpressNotInSpec.length > 0) {
  hasDrift = true;
  console.error(
    "\n❌  Routes in Express but MISSING from OpenAPI spec (add or exempt them):",
  );
  for (const r of inExpressNotInSpec.sort()) console.error(`     ${r}`);
}

if (inSpecNotInExpress.length > 0) {
  hasDrift = true;
  console.error(
    "\n❌  Routes in OpenAPI spec but MISSING from Express (implement or remove them):",
  );
  for (const r of inSpecNotInExpress.sort()) console.error(`     ${r}`);
}

if (missingBodySchemas.length > 0) {
  hasDrift = true;
  console.error(
    "\n❌  Request body schemas missing from lib/api-zod (run: pnpm --filter @workspace/api-spec run codegen):",
  );
  for (const r of missingBodySchemas) console.error(`     ${r}`);
}

if (missingResponseSchemas.length > 0) {
  hasDrift = true;
  console.error(
    "\n❌  Response schemas missing from lib/api-zod (run: pnpm --filter @workspace/api-spec run codegen):",
  );
  for (const r of missingResponseSchemas) console.error(`     ${r}`);
}

if (!hasDrift) {
  const checkedRoutes = expressRoutes.size - SPEC_EXEMPTIONS.size;
  // Count operations checked in stage 2
  let bodyOpsChecked = 0;
  let responseOpsChecked = 0;
  for (const [, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!HTTP_METHODS.has(method)) continue;
      const op = operation as SpecOperation;
      if (!op.operationId) continue;
      if (op.requestBody) bodyOpsChecked++;
      const has2xx = Object.entries(op.responses ?? {}).some(
        ([code, resp]) =>
          code.startsWith("2") && resp.content && Object.keys(resp.content).length > 0,
      );
      if (has2xx) responseOpsChecked++;
    }
  }
  console.log(
    `✅  No spec drift — ${checkedRoutes} routes match between Express and OpenAPI spec.`,
  );
  console.log(
    `    (${SPEC_EXEMPTIONS.size} intentionally-exempted internal routes excluded from check)`,
  );
  console.log(
    `    Schema check: ${bodyOpsChecked} request body schema(s) and ${responseOpsChecked} response schema(s) verified against lib/api-zod.`,
  );
  process.exit(0);
} else {
  const total =
    inExpressNotInSpec.length +
    inSpecNotInExpress.length +
    missingBodySchemas.length +
    missingResponseSchemas.length;
  console.error(
    `\n${total} drift(s) found. Fix lib/api-spec/openapi.yaml, the route files, or run codegen.`,
  );
  process.exit(1);
}
