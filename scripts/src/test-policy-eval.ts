/**
 * Regression test for policy-eval sandbox hardening (Task #25 — Security Batch 2).
 *
 * Demonstrates that evalPolicyRule:
 *   1. Evaluates valid rules correctly
 *   2. Terminates infinite-loop rules within the 500 ms timeout without crashing
 *   3. Rejects non-boolean results as "error" status
 *   4. Blocks access to Node.js globals (process, require) inside the vm context
 *   5. Returns fail-open (passed: true) for all error cases
 *
 * Run with: pnpm --filter @workspace/scripts run test-policy-eval
 */

import { evalPolicyRule } from "../../artifacts/api-server/src/lib/policy-eval.js";

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

// 3. Rule using context variable
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

// 5. Infinite loop — must be terminated within timeout
{
  console.log("\n5. Infinite loop — must terminate within 500ms timeout");
  const start = Date.now();
  // Note: this rule bypasses AST storage-time validation but demonstrates
  // that the vm.Script timeout kills runaway scripts even if a malicious or
  // corrupted rule is injected directly into the database.
  const r = evalPolicyRule("(function(){ while(true){} })()", ctx);
  const elapsed = Date.now() - start;
  assert(`terminated within 600ms (took ${elapsed}ms)`, elapsed < 600);
  assert("error is non-null (timeout surfaced)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error message: "${r.error.slice(0, 80)}"`);
}

// 6. Access to process — must be blocked (ReferenceError in sandbox)
{
  console.log("\n6. process.exit() attempt — must be blocked by sandbox");
  const r = evalPolicyRule("process.exit(1)", ctx);
  assert("error is non-null (ReferenceError expected)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error message: "${r.error.slice(0, 80)}"`);
}

// 7. Access to require — must be blocked
{
  console.log('\n7. require("fs") attempt — must be blocked by sandbox');
  const r = evalPolicyRule('require("fs").readFileSync("/etc/passwd")', ctx);
  assert("error is non-null (ReferenceError expected)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error message: "${r.error.slice(0, 80)}"`);
}

// 8. Non-boolean result — must return error status
{
  console.log('\n8. Non-boolean result (string) — must surface as error status');
  const r = evalPolicyRule('"hello"', ctx);
  assert("error is non-null (non-boolean result)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error message: "${r.error.slice(0, 80)}"`);
}

// 9. Valid complex rule
{
  console.log('\n9. Complex valid rule — combined conditions');
  const r = evalPolicyRule(
    'prompt.length > 0 && response.includes("capital") && model.startsWith("gpt")',
    ctx,
  );
  assert("no error", r.error === null);
  assert("passed === true", r.passed === true);
}

// 10. Sandbox isolation — no global prototype pollution
{
  console.log("\n10. Sandbox isolation — Object.prototype unavailable");
  const r = evalPolicyRule("Object.prototype.toString.call(prompt)", ctx);
  // Object is not in the sandbox, so this should throw ReferenceError
  assert("error is non-null (Object not in sandbox)", r.error !== null);
  assert("fail-open: passed === true", r.passed === true);
  if (r.error) console.log(`     error message: "${r.error.slice(0, 80)}"`);
}

console.log(`\n── Results: ${passed} passed, ${failed} failed ──────────────────────────────\n`);

if (failed > 0) {
  process.exit(1);
}
