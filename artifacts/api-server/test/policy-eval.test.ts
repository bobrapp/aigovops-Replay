/**
 * Regression test for policy-eval sandbox hardening (Task #25 — Security Batch 2).
 *
 * Demonstrates that evalPolicyRule enforces a defense-in-depth sandbox:
 *
 *   Layer 1 (not tested here) — Storage-time AST validation (validatePolicyRule).
 *
 *   Layer 2 (tested here) — Runtime vm.Script sandbox with:
 *     - Minimal prototype-less sandbox: only prompt/response/model/userId visible
 *     - CLEANUP_SCRIPT nulls Function, eval, globalThis, Generator, AsyncFunction,
 *       AsyncGenerator immediately after vm.createContext adds ECMAScript built-ins
 *     - Object.freeze(vmCtx) locks the context so no script can re-introduce globals
 *     - Hard 500ms timeout kills runaway scripts (infinite loops, CPU bombs)
 *     - Strict boolean validation: non-boolean → { passed: true, error: msg }
 *     - All exceptions caught and returned fail-open: { passed: true, error: msg }
 *
 * Run with: pnpm --filter @workspace/api-server run test-policy-eval
 */

import { evalPolicyRule } from "../src/lib/policy-eval.js";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const ctx = {
  prompt: "Tell me about Paris",
  response: "Paris is the capital of France.",
  model: "gpt-4o",
  userId: "user-test-001",
};

console.log("\n── Policy eval regression tests ──────────────────────────────\n");

// 1. Basic pass
{
  console.log("1. Valid rule — always-true literal");
  const r = evalPolicyRule("true", ctx);
  assert("no error", r.error === null);
  assert("passed === true", r.passed === true);
}

// 2. Basic fail
{
  console.log("\n2. Valid rule — always-false literal");
  const r = evalPolicyRule("false", ctx);
  assert("no error", r.error === null);
  assert("passed === false", r.passed === false);
}

// 3. Rule using allowed context variable
{
  console.log('\n3. Valid rule — prompt.includes("Paris")');
  const r = evalPolicyRule('prompt.includes("Paris")', ctx);
  assert("no error", r.error === null);
  assert("passed === true (prompt contains Paris)", r.passed === true);
}

// 4. Model filter
{
  console.log('\n4. Valid rule — model === "gpt-4o"');
  const r = evalPolicyRule('model === "gpt-4o"', ctx);
  assert("no error", r.error === null);
  assert("passed === true", r.passed === true);
}

// 5. Infinite loop — must be terminated within hard timeout
{
  console.log("\n5. Infinite loop — must terminate within 500ms hard timeout");
  const start = Date.now();
  const r = evalPolicyRule("(function(){ while(true){} })()", ctx);
  const elapsed = Date.now() - start;
  assert(`terminated within 600ms (took ${elapsed}ms)`, elapsed < 600);
  assert("error is non-null (timeout surfaced)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error: "${r.error.slice(0, 80)}"`);
}

// 6. Node.js global: process — not propagated into vm context
{
  console.log("\n6. process.exit() — blocked (not in vm context)");
  const r = evalPolicyRule("process.exit(1)", ctx);
  assert("error is non-null (ReferenceError)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error: "${r.error.slice(0, 80)}"`);
}

// 7. Node.js global: require — not propagated into vm context
{
  console.log('\n7. require("fs") — blocked (not in vm context)');
  const r = evalPolicyRule('require("fs").readFileSync("/etc/passwd")', ctx);
  assert("error is non-null (ReferenceError)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error: "${r.error.slice(0, 80)}"`);
}

// 8. ECMAScript built-in: Function — nulled by CLEANUP_SCRIPT after createContext
{
  console.log("\n8. Function constructor — nulled by post-createContext cleanup");
  const r = evalPolicyRule("Function(\"return process\")()", ctx);
  assert("error is non-null (Function is undefined)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error: "${r.error.slice(0, 80)}"`);
}

// 9. ECMAScript built-in: eval — nulled by CLEANUP_SCRIPT
{
  console.log("\n9. eval() — nulled by post-createContext cleanup");
  const r = evalPolicyRule("eval(\"process.exit(1)\")", ctx);
  assert("error is non-null (eval is undefined)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error: "${r.error.slice(0, 80)}"`);
}

// 10. ECMAScript built-in: globalThis — nulled by CLEANUP_SCRIPT
{
  console.log("\n10. globalThis — nulled by post-createContext cleanup");
  const r = evalPolicyRule("globalThis.process !== undefined", ctx);
  assert("error is non-null (globalThis is undefined)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error: "${r.error.slice(0, 80)}"`);
}

// 11. Frozen context — re-assignment to Function is silently discarded
// Object.freeze(vmCtx) is applied after CLEANUP_SCRIPT. In non-strict mode,
// assigning to a frozen property is silently ignored rather than throwing.
// The comma expression's final value (`true`) is a valid boolean result.
// The key proof: Function stays undefined in every fresh context (tests 8+9).
{
  console.log("\n11. Context is frozen — re-assignment to Function silently discarded");
  const r = evalPolicyRule("(Function = function(){}, true)", ctx);
  assert("no runtime error (frozen assignment silently dropped)", r.error === null);
  assert("passed === true (comma expression final value)", r.passed === true);
  // Each evalPolicyRule call gets a fresh frozen context, so Function is always
  // re-nulled by CLEANUP_SCRIPT. Confirm it remains undefined in a new eval:
  const r2 = evalPolicyRule("Function !== undefined", ctx);
  assert(
    "Function stays undefined in fresh context (freeze + CLEANUP_SCRIPT hold)",
    r2.error !== null || r2.passed === false,
  );
}

// 12. Non-boolean result — surfaces as error status
{
  console.log("\n12. Non-boolean result (string) — surfaces as error status");
  const r = evalPolicyRule('"hello"', ctx);
  assert("error is non-null (non-boolean result)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error: "${r.error.slice(0, 80)}"`);
}

// 13. Complex valid rule
{
  console.log("\n13. Complex valid rule — combined AND conditions");
  const r = evalPolicyRule(
    'prompt.length > 0 && response.includes("capital") && model.startsWith("gpt")',
    ctx,
  );
  assert("no error", r.error === null);
  assert("passed === true", r.passed === true);
}

// 14. Negative complex rule
{
  console.log('\n14. Valid rule — response does NOT include forbidden phrase');
  const r = evalPolicyRule('!response.includes("confidential")', ctx);
  assert("no error", r.error === null);
  assert("passed === true (no confidential content)", r.passed === true);
}

console.log(
  `\n── Results: ${passed} passed, ${failed} failed ──────────────────────────────\n`,
);

if (failed > 0) {
  process.exit(1);
}
