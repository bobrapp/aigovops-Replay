/**
 * Completely safe policy-rule evaluator.
 *
 * Security model:
 * - Zero code-execution paths: no vm, eval, or new Function at any point.
 * - Rules are tokenized into an explicit token stream, parsed into a constrained
 *   AST, then evaluated by walking only the allow-listed node kinds.
 * - Any identifier that is not in ALLOWED_VARS is rejected by the parser.
 * - Any property name that is not in ALLOWED_PROPS is rejected by the parser.
 * - The evaluator only invokes bound native string methods on known-safe strings.
 * - Prototype chain, globalThis, process, require, etc. are completely unreachable.
 */

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
 * Validate a policy rule expression before it is stored.
 * Returns null if the rule is valid, or a human-readable error string.
 *
 * Uses the tokenizer + parser as the sole validation mechanism —
 * no regex identifier-blocklist that can be bypassed via encoding.
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
 * - passed: true if the rule evaluated to a truthy value (policy not violated)
 * - error:  non-null when the rule could not be evaluated (parse or runtime error).
 *           When error is set, `passed` is always true (fail-open to avoid blocking
 *           all interactions on a misconfigured rule), and the caller should surface
 *           the `error` status rather than silently treating it as a pass.
 */
export type PolicyEvalResult = { passed: boolean; error: string | null };

/**
 * Safely evaluate a policy rule expression against an interaction context.
 *
 * Security model: this evaluator uses a pure tokenize → parse → walk-AST pipeline
 * with zero code-execution paths (no vm.Script, no new Function, no eval).
 * The grammar is deliberately finite (no loops, no recursion beyond 500-char rules
 * validated at storage time), so runaway/infinite-loop attacks are structurally
 * impossible. This is strictly more restrictive than a vm.Script sandbox.
 *
 * Error behaviour: evaluation errors are returned as { passed: true, error: message }
 * so the caller can surface a distinct "error" policy status without blocking mints.
 */
export function evalPolicyRule(
  rule: string,
  ctx: { prompt: string; response: string; model: string; userId: string },
): PolicyEvalResult {
  try {
    const toks = tokenize(rule);
    const ast = parse(toks);
    const result = evalAst(ast, ctx);
    return { passed: !!result, error: null };
  } catch (e: unknown) {
    return { passed: true, error: (e as Error).message ?? "Policy evaluation error" };
  }
}
