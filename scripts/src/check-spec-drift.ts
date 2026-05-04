/**
 * check-spec-drift.ts
 *
 * Compares the Express routes registered in artifacts/api-server/src/routes/
 * against the paths declared in lib/api-spec/openapi.yaml.
 *
 * Exits non-zero with a list of mismatches if any drift is detected.
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
// that are not part of the public contract and must never be generated into
// client SDKs.
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
// Normalize path params to a canonical form so Express `:id` and
// OpenAPI `{id}` compare equal.
// ---------------------------------------------------------------------------
function normalize(path: string): string {
  return path
    .replace(/\{[^}]+\}/g, ":p") // OpenAPI {param} → :p
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, ":p"); // Express :param → :p
}

// ---------------------------------------------------------------------------
// Parse OpenAPI spec
// ---------------------------------------------------------------------------
const specPath = resolve(ROOT, "lib/api-spec/openapi.yaml");
const spec = YAML.parse(readFileSync(specPath, "utf8")) as {
  paths: Record<string, Record<string, unknown>>;
};

const specRoutes = new Set<string>();
for (const [path, methods] of Object.entries(spec.paths ?? {})) {
  for (const method of Object.keys(methods)) {
    if (HTTP_METHODS.has(method)) {
      specRoutes.add(`${method.toUpperCase()} ${normalize(path)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Parse Express route files with regex
// Pattern: router.METHOD("path", ...) or router.METHOD('path', ...)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
let hasDrift = false;

if (inExpressNotInSpec.length > 0) {
  hasDrift = true;
  console.error(
    "\n❌  Routes in Express but MISSING from OpenAPI spec (add them or exempt them):",
  );
  for (const r of inExpressNotInSpec.sort()) console.error(`     ${r}`);
}

if (inSpecNotInExpress.length > 0) {
  hasDrift = true;
  console.error(
    "\n❌  Routes in OpenAPI spec but MISSING from Express (implement them or remove them):",
  );
  for (const r of inSpecNotInExpress.sort()) console.error(`     ${r}`);
}

if (!hasDrift) {
  const checkedCount = expressRoutes.size - SPEC_EXEMPTIONS.size;
  console.log(
    `✅  No spec drift — ${checkedCount} routes match between Express and OpenAPI spec.`,
  );
  console.log(
    `    (${SPEC_EXEMPTIONS.size} intentionally-exempted internal routes excluded from check)`,
  );
  process.exit(0);
} else {
  const total = inExpressNotInSpec.length + inSpecNotInExpress.length;
  console.error(
    `\n${total} drift(s) found. Fix lib/api-spec/openapi.yaml or the route files.`,
  );
  process.exit(1);
}
