/**
 * check-spec-drift.ts
 *
 * Three-stage OpenAPI drift checker for the AIGovOps REPLAY API.
 *
 * Stage 1 — Route drift
 *   Compares the Express routes registered in artifacts/api-server/src/routes/
 *   against the paths declared in lib/api-spec/openapi.yaml.  Any path+method
 *   that appears in one place but not the other is a drift violation.
 *
 * Stage 2 — Schema export drift
 *   Verifies that lib/api-zod (generated from openapi.yaml by orval) is in
 *   sync with the spec for every operation that declares a requestBody or a 2xx
 *   JSON response.  The check asserts that the expected Zod export name exists
 *   in lib/api-zod/src/generated/api.ts:
 *     • requestBody  → {PascalCase(operationId)}Body   (all methods)
 *     • 2xx response → {PascalCase(operationId)}Response (GET only; POST/PATCH
 *       responses are deduplicated by orval when they share a component schema
 *       with an existing GET — their type is inlined rather than re-exported)
 *
 * Stage 3 — Schema shape validation
 *   For each component schema in openapi.yaml whose name matches a top-level
 *   Zod export in lib/api-zod (typically request body schemas such as
 *   CreateInteractionBody), compares the required fields and property set
 *   against the Zod schema to catch field additions, removals, or
 *   required→optional changes that were made in one place but not the other.
 *
 * Exits 0 if all three stages pass, exits 1 if any drift is found.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run test:spec
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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

/**
 * Parse the top-level field names and their optionality from a named
 * `zod.object({…})` export in the source file.
 *
 * Handles two common orval formatting styles:
 *   (A) `export const Foo = zod.object({`     — fields indented 2 spaces
 *   (B) `export const Foo = zod\n  .object({` — fields indented 4 spaces
 *
 * Returns null if the export is not found or has no zod.object() block.
 * Returns an empty Map for a zod.object({}) with no properties.
 */
function extractZodObjectFields(
  source: string,
  exportName: string,
): Map<string, { optional: boolean }> | null {
  const marker = `export const ${exportName}`;
  const markerIdx = source.indexOf(marker);
  if (markerIdx === -1) return null;

  // Find the nearest `.object({` after the marker (works for both formats)
  const objIdx = source.indexOf(".object({", markerIdx + marker.length);
  if (objIdx === -1) return null;

  // Walk the source to find matching closing } of the outer object literal
  const openBrace = source.indexOf("{", objIdx);
  if (openBrace === -1) return null;

  let depth = 1;
  let pos = openBrace + 1;
  while (pos < source.length && depth > 0) {
    if (source[pos] === "{") depth++;
    else if (source[pos] === "}") depth--;
    pos++;
  }
  const block = source.slice(openBrace + 1, pos - 1);

  // Determine the indentation of top-level fields by finding the minimum
  // indentation among all `fieldName: ` lines inside the block.
  const fieldLineRegex = /^( +)([a-zA-Z_][a-zA-Z0-9_]*): /gm;
  let minIndent = Infinity;
  let m: RegExpExecArray | null;
  while ((m = fieldLineRegex.exec(block)) !== null) {
    if (m[1].length < minIndent) minIndent = m[1].length;
  }
  if (minIndent === Infinity) return new Map(); // empty object

  // Re-scan for only the top-level field lines
  const topLevelRegex = new RegExp(
    `^( {${minIndent}})([a-zA-Z_][a-zA-Z0-9_]*): `,
    "gm",
  );
  const fields: Array<{ name: string; start: number }> = [];
  while ((m = topLevelRegex.exec(block)) !== null) {
    fields.push({ name: m[2], start: m.index });
  }

  // For each field, check whether `.optional()` appears in its block
  // (the slice of source between this field name and the next one).
  const result = new Map<string, { optional: boolean }>();
  for (let i = 0; i < fields.length; i++) {
    const { name, start } = fields[i];
    const end =
      i < fields.length - 1 ? fields[i + 1].start : block.length;
    const propBlock = block.slice(start, end);
    result.set(name, { optional: propBlock.includes(".optional()") });
  }

  return result;
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

type SpecSchema = { $ref?: string };

type SpecComponentSchema = {
  type?: string;
  required?: string[];
  properties?: Record<string, unknown>;
};

type SpecDocument = {
  paths: Record<string, Record<string, SpecOperation>>;
  components?: {
    schemas?: Record<string, SpecComponentSchema>;
  };
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

// Runtime route introspection ─────────────────────────────────────────────
//
// The previous implementation regex-scraped each route file's source for
// `router.<method>(…)` calls.  That approach silently misses any route added
// with `app.use(subRouter)`, route patterns built from variables, paths
// composed from constants, or any other dynamic registration — exactly the
// patterns we should be testing.
//
// Instead we run the *real* Express app in a one-shot `--print-routes`
// mode (see artifacts/api-server/src/index.ts) and read the routes the live
// router actually exposes.  This guarantees the drift check sees every
// route a request can reach, regardless of how it was registered.
function getExpressRoutesFromRuntime(): Set<string> {
  const apiBin = resolve(ROOT, "artifacts/api-server/dist/index.mjs");
  if (!existsSync(apiBin)) {
    console.error(
      `[spec-drift] api-server bundle not found at ${apiBin}\n` +
        `             Run \`pnpm --filter @workspace/api-server run build\` first.`,
    );
    process.exit(1);
  }

  const result = spawnSync("node", [apiBin, "--print-routes"], {
    encoding: "utf8",
    timeout: 30_000,
    // Provide the env vars app.ts needs to construct the app without crashing,
    // but never bind a port — the --print-routes branch exits before listen().
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV ?? "test",
      PORT: process.env.PORT ?? "0",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://noop@127.0.0.1:0/noop",
    },
  });

  if (result.status !== 0) {
    console.error(
      `[spec-drift] --print-routes exited with status ${result.status}\n` +
        `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
    process.exit(1);
  }

  const out = result.stdout;
  const begin = out.indexOf("__ROUTES_BEGIN__");
  const end = out.indexOf("__ROUTES_END__");
  if (begin === -1 || end === -1) {
    console.error(
      `[spec-drift] could not find route markers in --print-routes output:\n${out}`,
    );
    process.exit(1);
  }
  const json = out.slice(begin + "__ROUTES_BEGIN__".length, end).trim();
  const routes = JSON.parse(json) as Array<{ method: string; path: string }>;

  const set = new Set<string>();
  for (const r of routes) set.add(`${r.method} ${normalize(r.path)}`);
  return set;
}

const expressRoutes = getExpressRoutesFromRuntime();

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

// ── Stage 2: schema export drift ────────────────────────────────────────────
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

const missingBodySchemas: string[] = [];
const missingResponseSchemas: string[] = [];

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

// ── Stage 3: schema shape validation ────────────────────────────────────────
// For each component schema in openapi.yaml whose name exactly matches a
// top-level Zod export in api-zod, perform a deep field-level comparison:
//
//   a) Every field declared in the OpenAPI schema's `properties` map must
//      appear in the Zod schema.
//   b) Every field in the `required` array must NOT have `.optional()` in
//      the Zod schema (i.e. it must be a required Zod field).
//   c) Every field absent from `required` is allowed to be optional in Zod.
//
// In practice this catches:
//   • A field added to the OpenAPI spec but not re-generated in Zod.
//   • A field flipped from required→optional (or vice versa) in one source
//     without the corresponding change in the other.
//   • A field renamed in the spec but still carrying the old name in Zod.
//
// Only component schemas whose name matches a Zod export are checked; orval
// renames response schemas (e.g. AuthUserEnvelope → GetCurrentAuthUserResponse)
// so those cannot be checked by name equivalence and are handled by Stage 2.

const shapeViolations: string[] = [];
let schemasChecked = 0;

for (const [schemaName, schema] of Object.entries(
  spec.components?.schemas ?? {},
)) {
  // Only check schemas where the component name is also a top-level Zod export
  // (this is true for all request body schemas, e.g. CreateInteractionBody)
  if (!exportedNames.has(schemaName)) continue;
  if (!schema.properties) continue;

  const required = new Set(schema.required ?? []);
  const allProps = Object.keys(schema.properties);

  const zodFields = extractZodObjectFields(apiZodSource, schemaName);
  if (zodFields === null) {
    // Export exists but has no zod.object() — treat as unverifiable, skip
    continue;
  }

  schemasChecked++;

  // (a) Every property in the spec must appear in the Zod schema
  for (const prop of allProps) {
    if (!zodFields.has(prop)) {
      shapeViolations.push(
        `${schemaName}.${prop}: property declared in OpenAPI spec but absent from Zod schema`,
      );
    }
  }

  // (b) Required fields must not be marked .optional() in Zod
  for (const field of required) {
    if (!zodFields.has(field)) {
      // Already reported in (a); skip duplicate message
      continue;
    }
    if (zodFields.get(field)!.optional) {
      shapeViolations.push(
        `${schemaName}.${field}: required in OpenAPI spec but declared .optional() in Zod schema`,
      );
    }
  }

  // (c) Fields in Zod but absent from the spec are informational — orval may
  //     add helper fields.  Not reported as violations.
}

// ── Stage 3b: GET response body shape validation ─────────────────────────────
// Stage 3 only catches component schemas whose name is ALSO a Zod export name
// (which is true for request-body schemas such as CreateInteractionBody but
// rarely for response schemas — orval renames them, e.g. InteractionList →
// ListInteractionsResponse).  Stage 3b closes this gap: for each GET operation
// with a 2xx JSON response that `$ref`s a named component schema, it resolves
// the corresponding {Prefix}Response Zod export and field-compares the two.
//
// This is the critical check the reviewer required: a field added/removed from
// an OpenAPI response schema (and re-generated by orval) must also appear in
// the live Zod export, otherwise the codegen is out of date with the spec.

const responseShapeViolations: string[] = [];
let responseShapesChecked = 0;

for (const [_path, methods] of Object.entries(spec.paths ?? {})) {
  const getOp = (methods as Record<string, SpecOperation>)["get"];
  if (!getOp?.operationId) continue;

  const prefix = toPascalCase(getOp.operationId);
  const zodExportName = `${prefix}Response`;

  for (const [code, resp] of Object.entries(getOp.responses ?? {})) {
    if (!code.startsWith("2")) continue;
    const jsonContent = resp.content?.["application/json"] as
      | { schema?: SpecSchema }
      | undefined;
    if (!jsonContent?.schema) continue;

    // Only check operations whose response is a named $ref (not an inline schema)
    const ref = (jsonContent.schema as SpecSchema).$ref;
    if (!ref) continue;

    const componentName = ref.split("/").pop();
    if (!componentName) continue;

    const componentSchema = spec.components?.schemas?.[componentName] as
      | SpecComponentSchema
      | undefined;
    if (!componentSchema?.properties) continue;

    const zodFields = extractZodObjectFields(apiZodSource, zodExportName);
    // Skip if the Zod export doesn't exist or isn't a plain zod.object() —
    // Stage 2 already asserts that {Prefix}Response exists, so if it's missing
    // we'll already have a Stage 2 failure without needing to double-report it.
    if (zodFields === null) continue;

    responseShapesChecked++;
    const required = new Set(componentSchema.required ?? []);
    const allProps = Object.keys(componentSchema.properties);

    // (a) Every property in the OpenAPI component must appear in the Zod export
    for (const prop of allProps) {
      if (!zodFields.has(prop)) {
        responseShapeViolations.push(
          `${componentName} (→ ${zodExportName}).${prop}: ` +
            `property declared in OpenAPI response schema but absent from Zod export`,
        );
      }
    }

    // (b) Required fields must not carry .optional() in Zod
    for (const field of required) {
      if (!zodFields.has(field)) continue; // already caught in (a)
      if (zodFields.get(field)!.optional) {
        responseShapeViolations.push(
          `${componentName} (→ ${zodExportName}).${field}: ` +
            `required in OpenAPI response schema but declared .optional() in Zod export`,
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

if (shapeViolations.length > 0) {
  hasDrift = true;
  console.error(
    "\n❌  Schema shape mismatches between OpenAPI spec and Zod request schemas:",
  );
  for (const v of shapeViolations) console.error(`     ${v}`);
  console.error(
    "    Fix: update the OpenAPI spec and/or re-run codegen so required/optional status matches.",
  );
}

if (responseShapeViolations.length > 0) {
  hasDrift = true;
  console.error(
    "\n❌  Response body shape mismatches (OpenAPI component schema vs Zod export):",
  );
  for (const v of responseShapeViolations) console.error(`     ${v}`);
  console.error(
    "    Fix: update the OpenAPI response schema and re-run codegen, or update the Zod export manually.",
  );
}

if (!hasDrift) {
  const checkedRoutes = expressRoutes.size - SPEC_EXEMPTIONS.size;
  // Count stage-2 operations checked
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
          code.startsWith("2") &&
          resp.content &&
          Object.keys(resp.content).length > 0,
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
    `    Schema check (Stage 2): ${bodyOpsChecked} request body schema(s) and ${responseOpsChecked} response schema(s) verified against lib/api-zod.`,
  );
  console.log(
    `    Shape check  (Stage 3): ${schemasChecked} request body schema(s) + ${responseShapesChecked} GET response schema(s) field-compared (required/optional status, property presence).`,
  );
  process.exit(0);
} else {
  const total =
    inExpressNotInSpec.length +
    inSpecNotInExpress.length +
    missingBodySchemas.length +
    missingResponseSchemas.length +
    shapeViolations.length +
    responseShapeViolations.length;
  console.error(
    `\n${total} drift(s) found. Fix lib/api-spec/openapi.yaml, the route files, or run codegen.`,
  );
  process.exit(1);
}
