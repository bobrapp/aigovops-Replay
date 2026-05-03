/**
 * Policy-rule evaluator — defense-in-depth sandbox.
 *
 * Two-layer security model:
 *
 *  Layer 1 — Storage-time AST validation (validatePolicyRule)
 *    Rules are tokenized and parsed by a strict allow-list grammar before storage.
 *    Only the four allowed variables (prompt, response, model, userId), allow-listed
 *    string methods, and boolean/comparison operators are accepted. Backtick template
 *    literals are explicitly blocked. This ensures no structurally dangerous expression
 *    can ever be persisted through the normal policy API.
 *
 *  Layer 2 — Runtime vm.Script sandbox (evalPolicyRule)
 *    Rules are executed inside a Node.js vm.Script context with:
 *      - Minimal prototype-less sandbox (Object.create(null) + only the 4 allowed vars)
 *      - No access to process, require, Buffer, global, or any Node.js runtime globals
 *        (vm.createContext does not propagate these from the main context)
 *      - Hard execution timeout (500 ms) — kills runaway scripts (infinite loops,
 *        CPU-heavy computations) without blocking the Node.js event loop
 *      - Strict boolean result validation — non-boolean returns surface as "error" status
 *      - All exceptions caught and mapped to fail-open { passed: true, error: msg }
 */

import { createContext, Script } from "node:vm";

const ALLOWED_VARS = new Set(["prompt", "response", "model", "userId"]);

const ALLOWED_STRING_METHODS = new Set([
  "includes",
  "startsWith",
  "endsWith",
  "toLowerCase",
  "toUpperCase",
  "trim",
  "split",
]);

const ALLOWED_PROPS = new Set(["length", ...ALLOWED_STRING_METHODS]);

const MAX_RULE_LENGTH = 500;

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type TK =
  | "str"
  | "num"
  | "bool"
  | "null"
  | "id"
  | "."
  | "("
  | ")"
  | ","
  | "!"
  | "typeof"
  | "&&"
  | "||"
  | "==="
  | "!=="
  | "<"
  | ">"
  | "<="
  | ">="
  | "eof";

interface Tok {
  k: TK;
  v: unknown;
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;

  while (i < src.length) {
    if (/\s/.test(src[i]!)) {
      i++;
      continue;
    }

    // String literals (single- and double-quoted)
    if (src[i] === '"' || src[i] === "'") {
      const q = src[i++];
      let s = "";
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") {
          i++;
          const esc = src[i++];
          switch (esc) {
            case "n":
              s += "\n";
              break;
            case "t":
              s += "\t";
              break;
            case "r":
              s += "\r";
              break;
            default:
              s += esc;
          }
        } else {
          s += src[i++];
        }
      }
      if (i >= src.length) throw new SyntaxError("Unterminated string literal");
      i++;
      toks.push({ k: "str", v: s });
      continue;
    }

    // Number literals
    if (/[0-9]/.test(src[i]!)) {
      let n = "";
      while (i < src.length && /[0-9.]/.test(src[i]!)) n += src[i++];
      toks.push({ k: "num", v: Number(n) });
      continue;
    }

    // Identifiers and reserved keywords
    if (/[a-zA-Z_]/.test(src[i]!)) {
      let id = "";
      while (i < src.length && /\w/.test(src[i]!)) id += src[i++];
      if (id === "true") toks.push({ k: "bool", v: true });
      else if (id === "false") toks.push({ k: "bool", v: false });
      else if (id === "null") toks.push({ k: "null", v: null });
      else if (id === "typeof") toks.push({ k: "typeof", v: null });
      else toks.push({ k: "id", v: id });
      continue;
    }

    // Multi-character operators (longest-match first)
    const s3 = src.slice(i, i + 3);
    if (s3 === "===") {
      toks.push({ k: "===", v: null });
      i += 3;
      continue;
    }
    if (s3 === "!==") {
      toks.push({ k: "!==", v: null });
      i += 3;
      continue;
    }

    const s2 = src.slice(i, i + 2);
    if (s2 === "&&") {
      toks.push({ k: "&&", v: null });
      i += 2;
      continue;
    }
    if (s2 === "||") {
      toks.push({ k: "||", v: null });
      i += 2;
      continue;
    }
    if (s2 === "<=") {
      toks.push({ k: "<=", v: null });
      i += 2;
      continue;
    }
    if (s2 === ">=") {
      toks.push({ k: ">=", v: null });
      i += 2;
      continue;
    }

    const c = src[i++];
    switch (c) {
      case ".":
        toks.push({ k: ".", v: null });
        break;
      case "(":
        toks.push({ k: "(", v: null });
        break;
      case ")":
        toks.push({ k: ")", v: null });
        break;
      case ",":
        toks.push({ k: ",", v: null });
        break;
      case "!":
        toks.push({ k: "!", v: null });
        break;
      case "<":
        toks.push({ k: "<", v: null });
        break;
      case ">":
        toks.push({ k: ">", v: null });
        break;
      default:
        throw new SyntaxError(`Unexpected character: "${c}"`);
    }
  }

  toks.push({ k: "eof", v: null });
  return toks;
}

// ─── AST ─────────────────────────────────────────────────────────────────────

type AstNode =
  | { k: "lit"; v: unknown }
  | { k: "var"; n: string }
  | { k: "prop"; obj: AstNode; prop: string }
  | { k: "call"; callee: AstNode; args: AstNode[] }
  | { k: "not"; expr: AstNode }
  | { k: "typeof"; expr: AstNode }
  | { k: "bin"; op: string; l: AstNode; r: AstNode };

// ─── Parser ───────────────────────────────────────────────────────────────────

function parse(toks: Tok[]): AstNode {
  let p = 0;

  const peek = (): Tok => toks[p]!;
  const eat = (k?: TK): Tok => {
    const t = toks[p++]!;
    if (k && t.k !== k) throw new SyntaxError(`Expected "${k}", got "${t.k}"`);
    return t;
  };
  const check = (...ks: TK[]): boolean => (ks as string[]).includes(peek().k);

  function orExpr(): AstNode {
    let l = andExpr();
    while (check("||")) {
      eat();
      l = { k: "bin", op: "||", l, r: andExpr() };
    }
    return l;
  }

  function andExpr(): AstNode {
    let l = eqExpr();
    while (check("&&")) {
      eat();
      l = { k: "bin", op: "&&", l, r: eqExpr() };
    }
    return l;
  }

  function eqExpr(): AstNode {
    let l = relExpr();
    while (check("===", "!==")) {
      const op = eat().k as string;
      l = { k: "bin", op, l, r: relExpr() };
    }
    return l;
  }

  function relExpr(): AstNode {
    let l = unary();
    while (check("<", ">", "<=", ">=")) {
      const op = eat().k as string;
      l = { k: "bin", op, l, r: unary() };
    }
    return l;
  }

  function unary(): AstNode {
    if (check("!")) {
      eat();
      return { k: "not", expr: unary() };
    }
    if (check("typeof")) {
      eat();
      return { k: "typeof", expr: postfix() };
    }
    return postfix();
  }

  function postfix(): AstNode {
    let node = primary();
    while (true) {
      if (check(".")) {
        eat();
        const tok = peek();
        if (tok.k !== "id")
          throw new SyntaxError("Expected property name after '.'");
        eat();
        const prop = tok.v as string;
        if (!ALLOWED_PROPS.has(prop))
          throw new Error(
            `Property "${prop}" is not allowed. Allowed: ${[...ALLOWED_PROPS].join(", ")}`,
          );
        node = { k: "prop", obj: node, prop };
      } else if (check("(")) {
        eat();
        const args: AstNode[] = [];
        if (!check(")")) {
          args.push(orExpr());
          while (check(",")) {
            eat();
            args.push(orExpr());
          }
        }
        eat(")");
        node = { k: "call", callee: node, args };
      } else {
        break;
      }
    }
    return node;
  }

  function primary(): AstNode {
    const t = peek();
    if (t.k === "str" || t.k === "num" || t.k === "bool" || t.k === "null") {
      eat();
      return { k: "lit", v: t.v };
    }
    if (t.k === "id") {
      eat();
      const name = t.v as string;
      if (!ALLOWED_VARS.has(name))
        throw new Error(
          `Identifier "${name}" is not allowed. Allowed variables: ${[...ALLOWED_VARS].join(", ")}`,
        );
      return { k: "var", n: name };
    }
    if (t.k === "(") {
      eat();
      const e = orExpr();
      eat(")");
      return e;
    }
    throw new SyntaxError(`Unexpected token: "${t.k}"`);
  }

  const ast = orExpr();
  if (peek().k !== "eof")
    throw new SyntaxError(
      `Unexpected token after end of expression: "${peek().k}"`,
    );
  return ast;
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

type RuleCtx = {
  prompt: string;
  response: string;
  model: string;
  userId: string;
};

function evalAst(node: AstNode, ctx: RuleCtx): unknown {
  switch (node.k) {
    case "lit":
      return node.v;

    case "var":
      return ctx[node.n as keyof RuleCtx];

    case "not":
      return !evalAst(node.expr, ctx);

    case "typeof":
      return typeof evalAst(node.expr, ctx);

    case "prop": {
      const obj = evalAst(node.obj, ctx);
      if (node.prop === "length") {
        if (typeof obj === "string" || Array.isArray(obj)) return obj.length;
        return 0;
      }
      if (typeof obj !== "string") {
        throw new TypeError(`Cannot call .${node.prop}() on a non-string value`);
      }
      // ALLOWED_PROPS enforcement already happened at parse time;
      // all remaining props are safe string methods.
      const strMethods = obj as unknown as Record<string, (...a: unknown[]) => unknown>;
      return strMethods[node.prop].bind(obj);
    }

    case "call": {
      const fn = evalAst(node.callee, ctx);
      if (typeof fn !== "function") throw new TypeError("Callee is not callable");
      const args = node.args.map((a) => evalAst(a, ctx));
      return (fn as (...a: unknown[]) => unknown)(...args);
    }

    case "bin": {
      const { op, l, r } = node;
      if (op === "&&") return evalAst(l, ctx) && evalAst(r, ctx);
      if (op === "||") return evalAst(l, ctx) || evalAst(r, ctx);
      const lv = evalAst(l, ctx);
      const rv = evalAst(r, ctx);
      switch (op) {
        case "===":
          return lv === rv;
        case "!==":
          return lv !== rv;
        case "<":
          return (lv as number) < (rv as number);
        case ">":
          return (lv as number) > (rv as number);
        case "<=":
          return (lv as number) <= (rv as number);
        case ">=":
          return (lv as number) >= (rv as number);
        default:
          throw new Error(`Unknown operator: "${op}"`);
      }
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Hard execution timeout for vm.Script rule evaluation.
 * 500 ms is ample for any valid policy expression and kills runaway scripts
 * (e.g. infinite loops injected via direct DB write) without stalling the
 * Node.js event loop.
 */
const EVAL_TIMEOUT_MS = 500;

/**
 * Validate a policy rule expression before it is stored.
 * Returns null if the rule is valid, or a human-readable error string.
 *
 * Uses the tokenizer + parser as the sole validation mechanism —
 * no regex identifier-blocklist that can be bypassed via encoding.
 * This catches structurally invalid or dangerous rule expressions at write
 * time so that evalPolicyRule only receives already-vetted rules.
 */
export function validatePolicyRule(rule: string): string | null {
  if (!rule || rule.trim().length === 0) return "Rule expression cannot be empty";
  if (rule.length > MAX_RULE_LENGTH)
    return `Rule expression must be ${MAX_RULE_LENGTH} characters or fewer (got ${rule.length})`;
  if (rule.includes("`"))
    return "Template literals (backticks) are not allowed in rule expressions";

  try {
    const toks = tokenize(rule);
    parse(toks);
    return null;
  } catch (e: unknown) {
    return (e as Error).message ?? "Invalid rule expression";
  }
}

/**
 * Result of evaluating a policy rule.
 *
 * - passed: true if the rule evaluated to boolean true (policy not violated)
 * - error:  non-null when the rule could not be evaluated (timeout, syntax error,
 *           non-boolean result, or any runtime exception). When error is set,
 *           `passed` is always true so a broken rule fails open rather than
 *           blocking all minting. The caller surfaces "error" policy status.
 */
export type PolicyEvalResult = { passed: boolean; error: string | null };

/**
 * Safely evaluate a policy rule expression against an interaction context.
 *
 * Defense-in-depth model (two layers):
 *
 *  Layer 1 — Storage-time AST validation (validatePolicyRule, called by policy routes)
 *    Rules are tokenized and parsed by a strict allow-list grammar before storage.
 *    Only the four allowed variables and allow-listed string methods are accepted.
 *    This rejects structurally dangerous expressions before they ever reach this path.
 *
 *  Layer 2 — Runtime vm.Script sandbox (this function)
 *    Even if a rule somehow bypasses Layer 1 (e.g. direct DB write), runtime
 *    execution is constrained by:
 *      - Minimal prototype-less sandbox: only prompt/response/model/userId are
 *        visible. vm.createContext does NOT propagate Node.js globals (process,
 *        require, Buffer, __dirname, global) into the new context.
 *      - Hard execution timeout (EVAL_TIMEOUT_MS = 500 ms): kills runaway scripts
 *        (infinite loops, CPU-heavy computations) without blocking the event loop.
 *      - Strict boolean result validation: non-boolean return values (strings,
 *        objects, undefined) are rejected and surface as "error" policy status
 *        rather than being silently coerced.
 *      - All exceptions (ReferenceError, SyntaxError, timeout) are caught and
 *        returned as { passed: true, error: message } so the route stays live.
 *
 * Error behaviour: evaluation errors surface as policyStatus "error" on the receipt.
 */
export function evalPolicyRule(
  rule: string,
  ctx: { prompt: string; response: string; model: string; userId: string },
): PolicyEvalResult {
  try {
    // Build a minimal, prototype-less sandbox. Object.create(null) removes all
    // Object.prototype methods from the global object of the new context.
    // vm.createContext does NOT copy Node.js globals (process, require, Buffer, etc.)
    // into the new context — those only exist in the main Node.js context.
    const sandbox = Object.create(null) as Record<string, string>;
    sandbox.prompt   = ctx.prompt;
    sandbox.response = ctx.response;
    sandbox.model    = ctx.model;
    sandbox.userId   = ctx.userId;

    const vmCtx = createContext(sandbox);

    // Wrap in parentheses so the rule is parsed as an expression (not a statement).
    // The timeout option kills runaway scripts after EVAL_TIMEOUT_MS milliseconds.
    const script = new Script(`(${rule})`);
    const result = script.runInContext(vmCtx, { timeout: EVAL_TIMEOUT_MS });

    // Strict boolean validation — silently coercing truthy/falsy values would hide
    // misconfigured rules (e.g. a rule that returns a string is almost certainly wrong).
    if (typeof result !== "boolean") {
      return {
        passed: true,
        error: `Policy rule must evaluate to a boolean; got "${typeof result}" (value: ${String(result).slice(0, 50)})`,
      };
    }

    return { passed: result, error: null };
  } catch (e: unknown) {
    return { passed: true, error: (e as Error).message ?? "Policy evaluation error" };
  }
}
