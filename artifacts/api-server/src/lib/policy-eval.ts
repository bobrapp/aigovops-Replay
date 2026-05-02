import vm from "vm";

/**
 * Identifiers that must never appear as identifiers in a policy rule expression.
 * These are checked against the rule with string-literal content removed to avoid
 * false positives on rules like `!response.includes("process")`.
 */
const BLOCKED_IDENTIFIERS = new Set([
  "process",
  "require",
  "import",
  "eval",
  "Function",
  "globalThis",
  "global",
  "__proto__",
  "constructor",
  "prototype",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "Buffer",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
  "queueMicrotask",
  "Promise",
  "Proxy",
  "Reflect",
  "Symbol",
  "WeakRef",
  "FinalizationRegistry",
  "Worker",
  "SharedArrayBuffer",
  "Atomics",
  "crypto",
  "module",
  "exports",
  "__dirname",
  "__filename",
  "this",
]);

/** Maximum allowed length for a rule expression string. */
const MAX_RULE_LENGTH = 500;

/** Maximum milliseconds a rule may run during evaluation. */
const EVAL_TIMEOUT_MS = 50;

/**
 * Strip the text content of string literals so that blocked identifiers
 * inside string arguments (e.g. `prompt.includes("process")`) do not
 * trigger false positives in the identifier check.
 */
function stripStringLiterals(code: string): string {
  return code
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/**
 * Validate a policy rule expression before storing it.
 * Returns null if the rule is acceptable, or a human-readable error string.
 *
 * This is a save-time gate that rejects rules containing dangerous identifiers
 * and syntactically invalid expressions.
 */
export function validatePolicyRule(rule: string): string | null {
  if (!rule || rule.trim().length === 0) {
    return "Rule expression cannot be empty";
  }
  if (rule.length > MAX_RULE_LENGTH) {
    return `Rule expression must be ${MAX_RULE_LENGTH} characters or fewer (got ${rule.length})`;
  }

  // Template literals can embed arbitrary expressions — disallow them entirely.
  if (rule.includes("`")) {
    return "Template literals (backticks) are not allowed in rule expressions";
  }

  // Strip string literals before checking identifiers to avoid false positives
  // on rules like `!response.includes("process")`.
  const codeWithoutStrings = stripStringLiterals(rule);

  for (const id of BLOCKED_IDENTIFIERS) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`).test(codeWithoutStrings)) {
      return `Identifier "${id}" is not permitted in rule expressions`;
    }
  }

  // Function declarations and zero-argument arrow functions can be used to
  // introduce a new scope and bypass the identifier blocklist indirectly.
  if (/\bfunction\s*\(/.test(codeWithoutStrings) || /\(\s*\)\s*=>/.test(codeWithoutStrings)) {
    return "Function declarations and zero-argument arrow functions are not allowed in rule expressions";
  }

  // Dry-run in a minimal vm context to catch syntax errors before saving.
  // We use empty strings so runtime errors on missing methods are expected and ignored.
  try {
    const sandbox = Object.create(null) as Record<string, unknown>;
    sandbox.prompt = "";
    sandbox.response = "";
    sandbox.model = "";
    sandbox.userId = "";
    vm.createContext(sandbox);
    vm.runInContext(`!!(${rule})`, sandbox, { timeout: EVAL_TIMEOUT_MS });
  } catch (e: unknown) {
    if (e instanceof SyntaxError) {
      return `Syntax error in rule expression: ${(e as Error).message}`;
    }
    // Other runtime errors on the empty sandbox are acceptable at this stage
  }

  return null;
}

/**
 * Safely evaluate a policy rule expression inside a sandboxed vm context.
 *
 * Security controls:
 * - Null-prototype sandbox: the context object has no prototype chain, which
 *   eliminates the most common prototype-based sandbox escape vectors.
 * - Only `prompt`, `response`, `model`, `userId` are in scope — no Node globals.
 * - Blocked-identifier check re-run at eval time so rules that bypassed the
 *   save-time validator (e.g. direct DB writes) are still rejected.
 * - 50ms timeout prevents infinite loops from blocking the event loop.
 *
 * Returns `true` if the rule passes (or errors), `false` if it fails.
 * Governance policy: a broken rule should not block all interactions.
 */
export function evalPolicyRule(
  rule: string,
  ctx: { prompt: string; response: string; model: string; userId: string },
): boolean {
  // Re-validate at eval time as a defense-in-depth measure (catches direct DB writes)
  const validationError = validatePolicyRule(rule);
  if (validationError !== null) {
    return true; // Treat invalid/dangerous rules as passing — do not execute them
  }

  try {
    const sandbox = Object.create(null) as Record<string, unknown>;
    sandbox.prompt = ctx.prompt;
    sandbox.response = ctx.response;
    sandbox.model = ctx.model;
    sandbox.userId = ctx.userId;
    vm.createContext(sandbox);

    const result = vm.runInContext(`!!(${rule})`, sandbox, {
      timeout: EVAL_TIMEOUT_MS,
    });

    return result === true;
  } catch {
    // Any runtime error or timeout: treat as passing rather than blocking interactions
    return true;
  }
}
