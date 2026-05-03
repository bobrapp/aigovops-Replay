import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ThemeProvider } from "./components/theme-provider";
import { Layout } from "./components/layout";
import { ModeProvider, useMode } from "./context/mode";
import { AdminAuthProvider } from "./context/adminAuth";
import { useAuth } from "@workspace/replit-auth-web";
import { Shield, Gauge, ChevronRight, ArrowRight, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGetStats } from "@workspace/api-client-react";
import TutorialPage from "./pages/tutorial";
import CertificatePage from "./pages/certificate";
import PublicVerifyPage from "./pages/public-verify";

// Expert pages
import Dashboard from "./pages/dashboard";
import ReceiptsList from "./pages/receipts/list";
import ReceiptDetail from "./pages/receipts/detail";
import SubmitReceipt from "./pages/receipts/new";
import ChainView from "./pages/chain";
import PoliciesList from "./pages/policies/list";
import CreatePolicy from "./pages/policies/new";
import VerifyReceipt from "./pages/verify";
import DemoPage from "./pages/demo";
import SpecPage from "./pages/spec";
import AgentsPage from "./pages/agents";
import AuditPage from "./pages/audit";
import AlertsPage from "./pages/alerts";

// Simple pages
import SimpleHome from "./pages/simple/home";
import SimpleRecord from "./pages/simple/record";
import SimpleHistory from "./pages/simple/history";
import SimpleCheck from "./pages/simple/check";

const queryClient = new QueryClient();

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ShieldMascot({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="48" r="46" fill="rgba(16,185,129,0.08)" />
      <circle cx="48" cy="48" r="36" fill="rgba(16,185,129,0.06)" />
      <path
        d="M48 8L14 22v22c0 19.8 15.4 38.4 34 42.4C65.6 82.4 82 63.8 82 44V22L48 8z"
        fill="url(#shield-gradient)" stroke="rgba(16,185,129,0.6)" strokeWidth="1.5"
      />
      <path
        d="M48 18L24 28.5v17c0 13.8 10.8 26.8 24 29.8 13.2-3 24-16 24-29.8v-17L48 18z"
        fill="rgba(16,185,129,0.12)"
      />
      <circle cx="38" cy="43" r="3.5" fill="#10B981" />
      <circle cx="58" cy="43" r="3.5" fill="#10B981" />
      <circle cx="39.5" cy="41.5" r="1.2" fill="rgba(255,255,255,0.6)" />
      <circle cx="59.5" cy="41.5" r="1.2" fill="rgba(255,255,255,0.6)" />
      <path d="M40 54 Q48 61 56 54" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <defs>
        <linearGradient id="shield-gradient" x1="48" y1="8" x2="48" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#0f2849" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const MOCK_PROMPT = "What is the capital of France?";
const MOCK_RESPONSE = "The capital of France is Paris.";
const MOCK_MODEL = "gpt-4o";
const MOCK_TIMESTAMP = "2026-01-15T10:30:00.000Z";

function HeroReceiptCard({ tampered }: { tampered?: boolean }) {
  const displayResponse = tampered
    ? MOCK_RESPONSE.replace("Paris", "Pari5")
    : MOCK_RESPONSE;

  return (
    <div className="hero-float w-full max-w-[340px] mx-auto">
      <div
        className="rounded-2xl overflow-hidden select-none"
        style={{
          background: "#0f1d33",
          border: "1px solid rgba(16,185,129,0.25)",
          boxShadow: "0 0 60px -10px rgba(16,185,129,0.45), 0 4px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Chat preview */}
        <div className="px-4 pt-4 pb-3 space-y-2.5">
          <div className="flex gap-2 items-start">
            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[10px]">👤</span>
            </div>
            <div className="rounded-xl rounded-tl-none px-3 py-2 text-xs text-white/80 max-w-[220px]"
              style={{ background: "rgba(255,255,255,0.06)" }}>
              {MOCK_PROMPT}
            </div>
          </div>
          <div className="flex gap-2 items-start flex-row-reverse">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[10px]">🤖</span>
            </div>
            <div
              className="rounded-xl rounded-tr-none px-3 py-2 text-xs max-w-[220px] transition-colors duration-300"
              style={{
                background: tampered ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
                color: tampered ? "#fca5a5" : "#6ee7b7",
                border: tampered ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(16,185,129,0.2)",
              }}
            >
              {displayResponse}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 border-t border-white/8" />
        <div className="px-4 py-1 flex items-center gap-2">
          <div className="h-px flex-1" style={{ background: "rgba(16,185,129,0.2)" }} />
          <span className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>
            SIGNED RECEIPT
          </span>
          <div className="h-px flex-1" style={{ background: "rgba(16,185,129,0.2)" }} />
        </div>

        {/* Metadata rows */}
        <div className="px-4 pb-3 space-y-1.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {[
            { label: "TIMESTAMP", value: "2026-01-15 · 10:30 UTC" },
            { label: "MODEL", value: MOCK_MODEL },
            { label: "SHA-256", value: tampered ? "ff3a…BROKEN" : "a3f2…8c9d" },
            { label: "PREV LINK", value: "GENESIS" },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-[9px] text-white/30 uppercase tracking-wider flex-shrink-0">{label}</span>
              <span
                className="text-[9px] truncate transition-colors duration-300"
                style={{
                  color: label === "SHA-256" && tampered ? "#f87171" : "rgba(255,255,255,0.6)",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* VERIFIED / BROKEN stamp */}
        <div className="px-4 pb-4">
          <div
            key={tampered ? "broken" : "verified"}
            className="stamp-animate flex items-center justify-center gap-2 rounded-lg py-2"
            style={{
              background: tampered ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
              border: tampered ? "2px solid rgba(239,68,68,0.5)" : "2px solid rgba(16,185,129,0.5)",
            }}
          >
            {tampered ? (
              <XCircle className="w-4 h-4" style={{ color: "#f87171" }} />
            ) : (
              <CheckCircle className="w-4 h-4" style={{ color: "#10b981" }} />
            )}
            <span
              className="text-xs font-bold tracking-widest uppercase"
              style={{
                color: tampered ? "#f87171" : "#10b981",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {tampered ? "CHAIN BROKEN" : "VERIFIED"}
            </span>
          </div>
        </div>

        {/* Chain link motif */}
        <div className="px-4 pb-4 flex items-center gap-1 justify-center">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-1 rounded-full transition-all duration-500"
              style={{
                width: i === 2 ? 20 : 12,
                background: tampered && i >= 2
                  ? "rgba(239,68,68,0.4)"
                  : "rgba(16,185,129,0.35)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SampleReceiptModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tampered, setTampered] = useState(false);
  const [hashes, setHashes] = useState<{ prompt: string; response: string; chain: string } | null>(null);

  const computeHashes = useCallback(async (response: string) => {
    const promptHash = await sha256hex("prompt:" + MOCK_PROMPT);
    const responseHash = await sha256hex("response:" + response);
    const chainHash = await sha256hex("chain:" + promptHash + ":" + responseHash + ":GENESIS");
    setHashes({ prompt: promptHash, response: responseHash, chain: chainHash });
  }, []);

  useEffect(() => {
    if (open) {
      setTampered(false);
      computeHashes(MOCK_RESPONSE);
    }
  }, [open, computeHashes]);

  useEffect(() => {
    if (open) {
      const response = tampered ? MOCK_RESPONSE.replace("Paris", "Pari5") : MOCK_RESPONSE;
      computeHashes(response);
    }
  }, [tampered, open, computeHashes]);

  const displayResponse = tampered ? MOCK_RESPONSE.replace("Paris", "Pari5") : MOCK_RESPONSE;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-lg"
        style={{ background: "#0a1628", border: "1px solid rgba(16,185,129,0.2)", color: "white" }}
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Shield className="w-4 h-4" style={{ color: "#10b981" }} />
            <span style={{ fontFamily: "'Satoshi', sans-serif" }}>Sample Signed Receipt</span>
          </DialogTitle>
        </DialogHeader>

        {/* Chat */}
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: "#0f1d33", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex gap-2 items-start">
            <span className="text-sm">👤</span>
            <div className="text-sm text-white/70 bg-white/5 rounded-lg px-3 py-1.5 text-xs">{MOCK_PROMPT}</div>
          </div>
          <div className="flex gap-2 items-start flex-row-reverse">
            <span className="text-sm">🤖</span>
            <div
              className="text-xs rounded-lg px-3 py-1.5 transition-all duration-500"
              style={{
                background: tampered ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
                color: tampered ? "#fca5a5" : "#6ee7b7",
                border: tampered ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(16,185,129,0.2)",
              }}
            >
              {displayResponse}
            </div>
          </div>
        </div>

        {/* Hash table */}
        <div
          className="rounded-xl p-4 space-y-2"
          style={{ background: "#0f1d33", fontFamily: "'JetBrains Mono', monospace" }}
        >
          <div className="text-[9px] uppercase tracking-widest mb-3" style={{ color: "#10b981" }}>
            CRYPTOGRAPHIC RECEIPT
          </div>
          {[
            { label: "PROMPT HASH", value: hashes?.prompt, field: "prompt" },
            { label: "RESPONSE HASH", value: hashes?.response, field: "response" },
            { label: "CHAIN HASH", value: hashes?.chain, field: "chain" },
            { label: "TIMESTAMP", value: MOCK_TIMESTAMP, field: null },
            { label: "MODEL", value: MOCK_MODEL, field: null },
            { label: "PREV LINK", value: "GENESIS", field: null },
          ].map(({ label, value, field }) => {
            const isBroken = tampered && (field === "response" || field === "chain");
            return (
              <div key={label} className="flex items-start gap-3">
                <span className="text-[9px] text-white/30 uppercase tracking-wider w-32 flex-shrink-0 pt-0.5">{label}</span>
                <span
                  className="text-[9px] break-all leading-relaxed transition-colors duration-300"
                  style={{ color: isBroken ? "#f87171" : "rgba(255,255,255,0.65)" }}
                >
                  {value ?? "…"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Status badge */}
        <div
          className="flex items-center justify-center gap-2 rounded-xl py-3 transition-all duration-500"
          style={{
            background: tampered ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
            border: tampered ? "2px solid rgba(239,68,68,0.4)" : "2px solid rgba(16,185,129,0.4)",
          }}
        >
          {tampered ? (
            <XCircle className="w-5 h-5 text-red-400" />
          ) : (
            <CheckCircle className="w-5 h-5" style={{ color: "#10b981" }} />
          )}
          <span
            className="text-sm font-bold tracking-widest uppercase"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: tampered ? "#f87171" : "#10b981",
            }}
          >
            {tampered ? "CHAIN BROKEN" : "VERIFIED"}
          </span>
        </div>

        {/* Tamper / Restore button */}
        <button
          onClick={() => setTampered((t) => !t)}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all hover:opacity-80"
          style={{
            background: tampered ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.07)",
            border: tampered ? "1px solid rgba(239,68,68,0.35)" : "1px solid rgba(255,255,255,0.12)",
            color: tampered ? "#fca5a5" : "rgba(255,255,255,0.7)",
          }}
        >
          {tampered ? (
            <>
              <RotateCcw className="w-3.5 h-3.5" />
              Restore original
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5" />
              Tamper this receipt
            </>
          )}
        </button>

        <p className="text-center text-white/30 text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          Changing one character breaks the entire hash chain — that's the point.
        </p>
      </DialogContent>
    </Dialog>
  );
}

const STAKES = [
  {
    icon: "⚖️",
    question: "Disputed AI output?",
    body: "Replay the exact conversation, byte-for-byte. Same prompt, same model version, same response — every time.",
  },
  {
    icon: "🔍",
    question: "Auditor at the door?",
    body: "Hand them a signed receipt for any AI interaction. Cryptographic proof, not screenshots that anyone can fake.",
  },
  {
    icon: "🚨",
    question: "Policy violation?",
    body: "Flagged the moment it happens. Policy-as-code rules check every interaction the instant it's signed.",
  },
];

function TrustStrip() {
  const { data: stats } = useGetStats();
  const count = stats?.totalInteractions;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {["SHA-256 signed", "Immutable chain", "Open source", "Policy-as-code"].map((badge) => (
        <span
          key={badge}
          className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
          style={{
            background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.2)",
            color: "#34d399",
          }}
        >
          {badge}
        </span>
      ))}
      <span
        className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full transition-all duration-500"
        style={{
          background: "rgba(16,185,129,0.15)",
          border: "1px solid rgba(16,185,129,0.3)",
          color: "#10b981",
        }}
      >
        {count !== undefined ? `● ${count.toLocaleString()} receipts verified` : "● receipts verified"}
      </span>
    </div>
  );
}

function ModePickerCollapsed({
  mode,
  setMode,
}: {
  mode: string;
  setMode: (m: "simple" | "expert") => void;
}) {
  return (
    <div className="pt-4 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
      <div className="text-[10px] uppercase tracking-widest mb-2.5" style={{ color: "rgba(255,255,255,0.3)" }}>
        Choose your experience
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setMode("simple")}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all"
          style={{
            background: mode === "simple" ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)",
            border: mode === "simple" ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(255,255,255,0.1)",
            color: mode === "simple" ? "#34d399" : "rgba(255,255,255,0.45)",
          }}
        >
          😊 Simple
        </button>
        <button
          onClick={() => setMode("expert")}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all"
          style={{
            background: mode === "expert" ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.05)",
            border: mode === "expert" ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.1)",
            color: mode === "expert" ? "#93c5fd" : "rgba(255,255,255,0.45)",
          }}
        >
          <Gauge className="w-3 h-3" /> Expert
        </button>
      </div>
      <p className="text-[10px] text-center mt-2" style={{ color: "rgba(255,255,255,0.2)" }}>
        You can switch anytime from the sidebar
      </p>
    </div>
  );
}

function WelcomeScreen({ onGuest }: { onGuest: () => void }) {
  const { mode, setMode } = useMode();
  const { login } = useAuth();
  const [sampleOpen, setSampleOpen] = useState(false);

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row relative overflow-hidden"
      style={{ background: "#060d1a" }}
    >
      {/* Radial glow — top-left */}
      <div
        className="glow-pulse absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)" }}
      />
      {/* Radial glow — bottom-right */}
      <div
        className="glow-pulse absolute -bottom-60 -right-60 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)", animationDelay: "2s" }}
      />

      {/* ── LEFT PANEL ── */}
      <div className="relative flex flex-col justify-center items-center lg:items-start px-8 lg:px-16 py-12 lg:py-0 lg:flex-1">
        <div className="max-w-lg w-full space-y-7">

          {/* Logo lockup */}
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 rounded-full blur-2xl opacity-40" style={{ background: "#10B981" }} />
              <ShieldMascot size={72} />
            </div>
            <div>
              <div className="text-xl font-bold text-white tracking-tight leading-tight" style={{ fontFamily: "'Satoshi', system-ui, sans-serif" }}>
                AIGovOps
              </div>
              <div className="text-xs font-semibold tracking-widest" style={{ color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>
                REPLAY · BLACKBOX
              </div>
              <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "rgba(255,255,255,0.35)" }}>
                Built for compliance teams, AI developers,<br />and anyone who needs to prove what an AI said.
              </div>
            </div>
          </div>

          {/* Headline */}
          <div>
            <h1
              className="text-4xl lg:text-5xl font-black leading-[1.05] tracking-tight text-white mb-4"
              style={{ fontFamily: "'Satoshi', system-ui, sans-serif", letterSpacing: "-0.02em" }}
            >
              Prove what your<br />
              <span style={{ color: "#10b981" }}>AI said.</span>{" "}
              <span className="text-white">Every time.</span>
            </h1>
            <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              Tamper-proof, cryptographically signed receipts for every AI conversation —
              pass audits, catch policy violations, and replay any chat in one click.
            </p>
          </div>

          {/* Stakes bullets */}
          <div className="space-y-4">
            {STAKES.map((stake) => (
              <div key={stake.question} className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">{stake.icon}</span>
                <div>
                  <div className="text-sm font-bold text-white mb-0.5" style={{ fontFamily: "'Satoshi', system-ui, sans-serif" }}>
                    {stake.question}
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                    {stake.body}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Trust signal strip */}
          <TrustStrip />

          {/* Foundation link */}
          <div className="pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <a
              href="https://www.aigovopsfoundation.org/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-80"
              style={{ color: "#34d399" }}
            >
              <Shield className="w-4 h-4" />
              aigovopsfoundation.org
              <ArrowRight className="w-3 h-3 opacity-60" />
            </a>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="relative flex flex-col justify-center px-8 lg:px-10 py-12 lg:w-[440px] lg:flex-shrink-0">
        <div className="w-full max-w-sm mx-auto space-y-5">

          {/* Hero receipt card */}
          <HeroReceiptCard />

          {/* Primary CTA */}
          <button
            onClick={() => setSampleOpen(true)}
            className="w-full flex items-center justify-center gap-2.5 rounded-xl py-3.5 font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #10B981, #059669)",
              color: "white",
              fontFamily: "'Satoshi', system-ui, sans-serif",
              boxShadow: "0 0 24px rgba(16,185,129,0.35)",
            }}
            data-testid="btn-see-sample"
          >
            <Shield className="w-4 h-4" />
            See a sample receipt
            <ChevronRight className="w-4 h-4 opacity-70" />
          </button>

          {/* Secondary CTA — sign in */}
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-2.5 rounded-xl py-3 font-semibold text-sm transition-all hover:opacity-80"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.75)",
              fontFamily: "'Satoshi', system-ui, sans-serif",
            }}
            data-testid="btn-signin"
          >
            <Shield className="w-3.5 h-3.5" />
            Sign in with Replit
          </button>

          {/* Guest continue */}
          <button
            onClick={onGuest}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium transition-colors py-1.5 hover:opacity-80"
            style={{ color: "rgba(255,255,255,0.35)" }}
            data-testid="btn-continue-guest"
          >
            Continue without signing in
            <ArrowRight className="w-3 h-3" />
          </button>

          {/* Mode picker — collapsed below CTAs */}
          <ModePickerCollapsed mode={mode} setMode={setMode} />
        </div>
      </div>

      {/* Sample receipt modal */}
      <SampleReceiptModal open={sampleOpen} onClose={() => setSampleOpen(false)} />
    </div>
  );
}

function Router() {
  const { mode } = useMode();
  const isSimple = mode === "simple";

  return (
    <Layout>
      <Switch>
        <Route path="/" component={isSimple ? SimpleHome : Dashboard} />
        <Route path="/record" component={SimpleRecord} />
        <Route path="/history" component={SimpleHistory} />
        <Route path="/check" component={SimpleCheck} />
        <Route path="/demo" component={DemoPage} />
        <Route path="/receipts" component={ReceiptsList} />
        <Route path="/receipts/new" component={SubmitReceipt} />
        <Route path="/receipts/:id" component={ReceiptDetail} />
        <Route path="/chain" component={ChainView} />
        <Route path="/agents" component={AgentsPage} />
        <Route path="/policies" component={PoliciesList} />
        <Route path="/policies/new" component={CreatePolicy} />
        <Route path="/audit" component={AuditPage} />
        <Route path="/alerts" component={AlertsPage} />
        <Route path="/verify" component={VerifyReceipt} />
        <Route path="/spec" component={SpecPage} />
        <Route path="/tutorial" component={TutorialPage} />
        <Route path="/certificate" component={CertificatePage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const [guestMode, setGuestMode] = useState(() => {
    try { return localStorage.getItem("aigovops_guest") === "true"; } catch { return false; }
  });

  function enterGuest() {
    try { localStorage.setItem("aigovops_guest", "true"); } catch { /* ignore */ }
    setGuestMode(true);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#060d1a" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
          <div className="text-white/40 font-mono text-xs">Loading…</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !guestMode) {
    return <WelcomeScreen onGuest={enterGuest} />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="aigovops-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ModeProvider>
            <AdminAuthProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Switch>
                  {/* Public route — no auth required; must come before AuthGate */}
                  <Route path="/verify/:id" component={PublicVerifyPage} />
                  <Route>
                    <AuthGate>
                      <Router />
                    </AuthGate>
                  </Route>
                </Switch>
              </WouterRouter>
            </AdminAuthProvider>
          </ModeProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
