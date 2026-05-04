/**
 * demo-gallery.tsx
 *
 * Anonymous landing-page gallery for the public demo chain.
 *
 * Each card renders one DemoReceipt fetched from GET /api/demo/chain. The
 * card lets a visitor toggle a "tamper" state that swaps one character in the
 * response and recomputes the chain hash on the client — visually proving
 * that a single-byte change breaks the stored chainHash, with no server
 * roundtrip required.
 */
import { useEffect, useMemo, useState } from "react";
import { useGetDemoChain } from "@workspace/api-client-react";
import type { DemoReceipt } from "@workspace/api-client-react";
import { CheckCircle, XCircle, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";

/**
 * Match server hashPrompt / hashResponse / buildChainHash exactly. Any drift
 * here will silently break the "verified" badge for un-tampered receipts.
 */
async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function recomputeChainHash(
  prompt: string,
  response: string,
  prevHash: string | null,
): Promise<string> {
  const ph = await sha256hex(`prompt:${prompt}`);
  const rh = await sha256hex(`response:${response}`);
  const prev = prevHash ?? "GENESIS";
  return sha256hex(`chain:${ph}:${rh}:${prev}`);
}

/**
 * Mutate one visible character in the response so the recomputed hash will
 * not match the stored chainHash. Falls back to appending "X" if the response
 * has no mutable letter.
 */
function tamperResponse(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/[A-Za-z]/.test(c)) {
      const replacement = c === "o" ? "0" : c === "l" ? "1" : c === "i" ? "1" : "X";
      return s.slice(0, i) + replacement + s.slice(i + 1);
    }
  }
  return s + "X";
}

function shortHash(h: string): string {
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

function formatTimestamp(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

interface DemoCardProps {
  receipt: DemoReceipt;
}

function DemoCard({ receipt }: DemoCardProps) {
  const [tampered, setTampered] = useState(false);
  const [recomputed, setRecomputed] = useState<string | null>(null);

  // Recompute the chain hash whenever the tamper toggle flips. The original
  // response's recomputed hash must match the server-stored chainHash; the
  // tampered response's recomputed hash must NOT match.
  useEffect(() => {
    let cancelled = false;
    const responseToHash = tampered ? tamperResponse(receipt.response) : receipt.response;
    recomputeChainHash(receipt.prompt, responseToHash, receipt.prevHash ?? null).then(
      (h) => {
        if (!cancelled) setRecomputed(h);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tampered, receipt.prompt, receipt.response, receipt.prevHash]);

  const matches = recomputed !== null && recomputed === receipt.chainHash;
  const verdict: "verified" | "broken" | "loading" =
    recomputed === null ? "loading" : matches ? "verified" : "broken";

  const policyFailed = receipt.policyStatus === "fail";
  const displayResponse = tampered ? tamperResponse(receipt.response) : receipt.response;

  return (
    <div
      className="rounded-xl p-4 space-y-3 transition-colors"
      data-testid="demo-card"
      style={{
        background: "#0f1d33",
        border:
          verdict === "broken"
            ? "1px solid rgba(239,68,68,0.35)"
            : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Header: model + tags + policy badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{
              background: "rgba(16,185,129,0.12)",
              color: "#6ee7b7",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {receipt.model}
          </span>
          {(receipt.tags ?? []).slice(0, 2).map((t) => (
            <span
              key={t}
              className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}
            >
              {t}
            </span>
          ))}
        </div>
        {policyFailed ? (
          <span
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex-shrink-0"
            style={{
              background: "rgba(239,68,68,0.15)",
              color: "#fca5a5",
              border: "1px solid rgba(239,68,68,0.3)",
            }}
            data-testid="badge-policy-fail"
          >
            <ShieldAlert className="w-3 h-3" />
            POLICY FAIL
          </span>
        ) : (
          <span
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex-shrink-0"
            style={{ background: "rgba(16,185,129,0.12)", color: "#6ee7b7" }}
          >
            <ShieldCheck className="w-3 h-3" />
            POLICY OK
          </span>
        )}
      </div>

      {/* Prompt + response */}
      <div className="space-y-2">
        <div className="flex gap-2 items-start">
          <span className="text-xs flex-shrink-0">👤</span>
          <div
            className="text-xs leading-relaxed text-white/70 bg-white/5 rounded-lg px-3 py-2 line-clamp-3"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            {receipt.prompt}
          </div>
        </div>
        <div className="flex gap-2 items-start flex-row-reverse">
          <span className="text-xs flex-shrink-0">🤖</span>
          <div
            className="text-xs rounded-lg px-3 py-2 line-clamp-4 transition-colors duration-300"
            style={{
              background: tampered ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.08)",
              color: tampered ? "#fca5a5" : "#a7f3d0",
              border: tampered ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(16,185,129,0.15)",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            {displayResponse}
          </div>
        </div>
      </div>

      {/* Policy violations list */}
      {policyFailed && receipt.policyViolations.length > 0 && (
        <div className="space-y-1">
          {receipt.policyViolations.map((v) => (
            <div
              key={v}
              className="text-[10px] px-2 py-1 rounded"
              style={{
                background: "rgba(239,68,68,0.08)",
                color: "#fca5a5",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {v}
            </div>
          ))}
        </div>
      )}

      {/* Hash row */}
      <div
        className="text-[10px] space-y-1 pt-2 border-t"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex justify-between gap-2">
          <span className="text-white/30">STORED HASH</span>
          <span className="text-white/60 truncate">{shortHash(receipt.chainHash)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-white/30">RECOMPUTED</span>
          <span
            className="truncate transition-colors"
            style={{ color: verdict === "broken" ? "#f87171" : "rgba(255,255,255,0.6)" }}
          >
            {recomputed ? shortHash(recomputed) : "…"}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-white/30">TIMESTAMP</span>
          <span className="text-white/40">{formatTimestamp(receipt.createdAt)}</span>
        </div>
      </div>

      {/* Verdict + tamper toggle */}
      <div className="flex items-center gap-2">
        <div
          className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2 transition-colors"
          style={{
            background:
              verdict === "broken"
                ? "rgba(239,68,68,0.12)"
                : verdict === "verified"
                  ? "rgba(16,185,129,0.12)"
                  : "rgba(255,255,255,0.04)",
            border:
              verdict === "broken"
                ? "1px solid rgba(239,68,68,0.4)"
                : verdict === "verified"
                  ? "1px solid rgba(16,185,129,0.4)"
                  : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {verdict === "broken" ? (
            <XCircle className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <CheckCircle
              className="w-3.5 h-3.5"
              style={{ color: verdict === "verified" ? "#10b981" : "rgba(255,255,255,0.3)" }}
            />
          )}
          <span
            className="text-[10px] font-bold tracking-widest uppercase"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color:
                verdict === "broken"
                  ? "#f87171"
                  : verdict === "verified"
                    ? "#10b981"
                    : "rgba(255,255,255,0.4)",
            }}
          >
            {verdict === "broken" ? "CHAIN BROKEN" : verdict === "verified" ? "VERIFIED" : "VERIFYING"}
          </span>
        </div>
        <button
          onClick={() => setTampered((t) => !t)}
          className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-2 rounded-lg transition-colors hover:opacity-80"
          style={{
            background: tampered ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.05)",
            color: tampered ? "#fca5a5" : "rgba(255,255,255,0.55)",
            border: tampered ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.1)",
          }}
          data-testid="btn-tamper-toggle"
        >
          {tampered ? (
            <>
              <RotateCcw className="w-3 h-3" />
              Restore
            </>
          ) : (
            "Tamper"
          )}
        </button>
      </div>
    </div>
  );
}

interface DemoGalleryProps {
  /** Maximum cards to render. Defaults to all received from the API. */
  limit?: number;
  /** Compact mode = no internal scroll wrapper, used by full-page views. */
  compact?: boolean;
}

export function DemoGallery({ limit, compact }: DemoGalleryProps) {
  const { data, isLoading, isError } = useGetDemoChain();

  const items = useMemo(() => {
    const all = data?.items ?? [];
    return typeof limit === "number" ? all.slice(0, limit) : all;
  }, [data, limit]);

  if (isLoading) {
    return (
      <div className="text-center text-xs text-white/40 py-6" data-testid="demo-gallery-loading">
        Loading demo receipts…
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="text-center text-xs text-red-300 py-4 px-3 rounded-lg"
        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
        data-testid="demo-gallery-error"
      >
        Could not load demo receipts. Try refreshing.
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center text-xs text-white/40 py-6" data-testid="demo-gallery-empty">
        No demo receipts yet — be the first to mint one below.
      </div>
    );
  }

  return (
    <div
      className={compact ? "space-y-3" : "space-y-3 max-h-[520px] overflow-y-auto pr-2"}
      data-testid="demo-gallery"
    >
      {items.map((r) => (
        <DemoCard key={r.id} receipt={r} />
      ))}
    </div>
  );
}
