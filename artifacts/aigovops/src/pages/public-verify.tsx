import { useParams, useSearch } from "wouter";
import { useState, useEffect } from "react";
import { Shield, CheckCircle, XCircle, Loader2, Hash, Lock } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface PublicVerifyResult {
  id: string;
  model: string;
  createdAt: string;
  prompt: string | null;
  response: string | null;
  redacted: boolean;
  promptHash: string;
  responseHash: string;
  chainHash: string;
  prevHash: string | null;
  policyStatus: string;
  valid: boolean;
  promptHashMatch: boolean;
  responseHashMatch: boolean;
  chainIntact: boolean;
  details: string;
  checkedAt: string;
}

function HashRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wider w-32 flex-shrink-0 pt-0.5 font-semibold">{label}</span>
      <span className="text-xs text-foreground font-mono break-all">{value}</span>
    </div>
  );
}

function VerifyStep({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      <div className={`flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 ${ok ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
        {ok ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />}
      </div>
      <span className={`text-sm font-medium ${ok ? "text-emerald-700" : "text-red-700"}`}>{label}</span>
      <span className={`ml-auto text-xs font-bold uppercase tracking-wide ${ok ? "text-emerald-600" : "text-red-600"}`}>
        {ok ? "Pass" : "Fail"}
      </span>
    </div>
  );
}

export default function PublicVerifyPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const [result, setResult] = useState<PublicVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (!id || !token) {
      setError("Invalid verification link — receipt ID or share token is missing.");
      setLoading(false);
      return;
    }

    fetch(`${base}/api/verify/${id}?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 401) throw new Error("This verification link is invalid or has expired.");
        if (res.status === 404) throw new Error("Receipt not found.");
        if (res.status === 422) throw new Error("Chain depth limit exceeded — this chain is too long to verify online.");
        if (!res.ok) throw new Error(`Verification failed (${res.status}).`);
        return res.json() as Promise<PublicVerifyResult>;
      })
      .then((data) => {
        setResult(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Verification failed.");
        setLoading(false);
      });
  }, [id, token, base]);

  return (
    <div className="min-h-screen" style={{ background: "#060d1a" }}>
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#1B3B6F" }}>
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-lg font-bold text-white">AIGovOps Verification</div>
            <div className="text-xs font-mono" style={{ color: "rgba(16,185,129,0.8)" }}>Cryptographic receipt integrity check</div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-white/60 py-12 justify-center">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm font-medium">Verifying receipt…</span>
          </div>
        )}

        {error && !loading && (
          <div
            className="rounded-xl border-2 p-6 space-y-3"
            style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.3)" }}
            data-testid="public-verify-error"
          >
            <div className="flex items-center gap-2.5">
              <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
              <div className="text-base font-bold text-red-300">Verification Error</div>
            </div>
            <div className="text-sm text-red-300/80">{error}</div>
            <div className="pt-2">
              <Link href="/">
                <Button variant="outline" size="sm" className="text-white/60 border-white/20 hover:text-white">
                  Go to AIGovOps
                </Button>
              </Link>
            </div>
          </div>
        )}

        {result && !loading && (
          <>
            {/* Verdict banner */}
            <div
              className="rounded-2xl border-2 p-6"
              style={{
                background: result.valid ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                borderColor: result.valid ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)",
              }}
              data-testid="public-verify-verdict"
            >
              <div className="flex items-center gap-4">
                {result.valid
                  ? <CheckCircle className="w-12 h-12 flex-shrink-0" style={{ color: "#10b981" }} />
                  : <XCircle className="w-12 h-12 flex-shrink-0 text-red-400" />}
                <div>
                  <div
                    className="text-2xl font-black tracking-wide"
                    style={{ color: result.valid ? "#10b981" : "#f87171", fontFamily: "'JetBrains Mono', monospace" }}
                    data-testid="public-verify-badge"
                  >
                    {result.valid ? "VERIFIED" : "TAMPERED"}
                  </div>
                  <div className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Checked at {new Date(result.checkedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Receipt metadata */}
            <div className="rounded-xl border p-5 space-y-3" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3">Receipt Details</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-1">Model</div>
                  <div className="text-white font-semibold">{result.model}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-1">Date</div>
                  <div className="text-white/80">{new Date(result.createdAt).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-1">Policy</div>
                  <div className={`font-bold uppercase text-sm ${result.policyStatus === "pass" ? "text-emerald-400" : result.policyStatus === "fail" ? "text-red-400" : "text-amber-400"}`}>
                    {result.policyStatus}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-1">ID</div>
                  <div className="text-white/60 font-mono text-xs truncate">{result.id.slice(0, 24)}…</div>
                </div>
              </div>
            </div>

            {/* Prompt / Response (or redaction notice) */}
            {result.redacted ? (
              <div className="rounded-xl border p-5 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                <Lock className="w-4 h-4 text-white/30 flex-shrink-0" />
                <div className="text-sm text-white/40 italic">The owner has chosen to redact the prompt and response from this public view.</div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border p-4" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
                  <div className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2">Prompt</div>
                  <div className="text-sm text-white/80 whitespace-pre-wrap" data-testid="public-verify-prompt">{result.prompt}</div>
                </div>
                <div className="rounded-xl border p-4" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
                  <div className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2">Response</div>
                  <div className="text-sm text-white/80 whitespace-pre-wrap" data-testid="public-verify-response">{result.response}</div>
                </div>
              </div>
            )}

            {/* Verification checks */}
            <div className="rounded-xl border p-5" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
                <Hash className="w-3.5 h-3.5" />Cryptographic Checks
              </div>
              <VerifyStep label="Prompt Hash" ok={result.promptHashMatch} />
              <VerifyStep label="Response Hash" ok={result.responseHashMatch} />
              <VerifyStep label="Chain Linkage" ok={result.chainIntact} />
              <div className="text-xs font-mono pt-3 mt-1" style={{ color: "rgba(255,255,255,0.3)" }} data-testid="public-verify-details">
                {result.details}
              </div>
            </div>

            {/* Hashes */}
            <div className="rounded-xl border p-5" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3">Hash Values</div>
              <HashRow label="Prompt Hash" value={result.promptHash} />
              <HashRow label="Response Hash" value={result.responseHash} />
              <HashRow label="Chain Hash" value={result.chainHash} />
              <HashRow label="Prev Hash" value={result.prevHash ?? "(genesis)"} />
            </div>

            {/* Footer */}
            <div className="text-center">
              <div className="text-xs text-white/25 font-mono mb-3">Powered by AIGovOps REPLAY — cryptographically signed AI interaction receipts</div>
              <Link href="/">
                <Button variant="outline" size="sm" className="text-white/50 border-white/15 hover:text-white hover:border-white/30">
                  Sign in to AIGovOps
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
