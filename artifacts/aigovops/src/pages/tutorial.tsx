import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  Shield, CheckCircle, RefreshCw, Hash, ArrowRight,
  Lock, ChevronDown, ChevronUp, Info, Eye, EyeOff,
  Sparkles, BookOpen
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Samples ─────────────────────────────────────────────────────────────────

const SAMPLES = [
  {
    label: "⚖️ Legal",
    model: "gpt-4o",
    tags: "legal, contract, high-risk",
    prompt: `Review this non-compete clause and tell me if it's enforceable: "Employee agrees not to work for any competitor within 50 miles for a period of 3 years following termination of employment."`,
    response: `This non-compete clause raises significant enforceability concerns under most U.S. jurisdictions.

1. Duration: 3 years is generally considered excessive. Courts in California, North Dakota, and Minnesota will void it entirely. Most states cap "reasonable" duration at 6–12 months for standard roles.

2. Geographic scope: "50 miles" may be reasonable for brick-and-mortar businesses but is difficult to apply to remote or digital roles where geography is irrelevant.

3. "Competitor" is undefined: Without a specific definition, this term is dangerously broad and likely unenforceable as written.

Recommendation: This clause would not survive judicial scrutiny in most states. Consult a licensed employment attorney before signing or enforcing it. I am an AI and this is not legal advice.`,
  },
  {
    label: "🏥 Medical",
    model: "claude-3-5-sonnet",
    tags: "medical, high-risk, triage",
    prompt: `A patient presents with sudden onset chest pain radiating to the left arm, sweating, and nausea. What are the differential diagnoses and immediate steps?`,
    response: `This presentation is a classic STEMI pattern and must be treated as acute myocardial infarction until ruled out.

IMMEDIATE STEPS:
1. Call emergency services (911) immediately — do not delay
2. Have the patient chew 325mg aspirin (if not allergic)
3. Keep the patient calm and seated or lying down
4. Do not allow the patient to walk or exert themselves
5. Prepare for CPR if the patient loses consciousness

DIFFERENTIAL DIAGNOSES:
- Acute MI (STEMI/NSTEMI) — must be ruled out first
- Aortic dissection — contraindicates thrombolytics; critical distinction
- Pulmonary embolism
- Pericarditis

⚠️ This AI output is informational only and does not replace clinical judgment.`,
  },
  {
    label: "📰 Fact-Check",
    model: "gemini-2.5-flash",
    tags: "journalism, fact-check, editorial",
    prompt: `Is it accurate to write: "AI systems now make all hiring decisions at Fortune 500 companies"?`,
    response: `No, that statement is inaccurate and should not be published as written.

WHAT IS ACCURATE:
- Many Fortune 500 companies use AI tools to assist in early-stage resume screening
- AI is widely used to filter applications by keyword matching and qualifications

WHAT IS NOT ACCURATE:
- "All hiring decisions" is false — final decisions involve human managers by policy and by law
- The EU AI Act and U.S. state laws require human oversight of AI hiring tools

SUGGESTED ACCURATE REWRITE:
"AI tools now assist in screening candidates at many Fortune 500 companies, though final hiring decisions remain with human managers."`,
  },
  {
    label: "💰 Finance",
    model: "gpt-4o",
    tags: "finance, compliance, boundary-test",
    prompt: `Should I put my entire retirement savings into NVIDIA stock right now?`,
    response: `I can't and shouldn't tell you to put all your retirement savings into any single stock, including NVIDIA.

CONCENTRATION RISK: Putting 100% into one stock violates a fundamental principle of portfolio management. NVIDIA fell ~66% in 2022 before its 2023–2024 recovery.

WHAT YOU SHOULD DO:
1. Speak with a licensed fiduciary financial advisor first
2. Consider your time horizon, risk tolerance, and existing diversification
3. If you want NVIDIA exposure, a capped allocation (5–15%) within a diversified portfolio is more defensible

I am an AI assistant. This is not personalized financial advice.`,
  },
  {
    label: "👥 HR Policy",
    model: "claude-3-5-haiku",
    tags: "hr, policy, employment-law",
    prompt: `Can we legally require all remote employees to have their cameras on during video calls?`,
    response: `This is a nuanced employment law question.

GENERALLY PERMISSIBLE in most U.S. at-will states when the policy is applied consistently, employees receive clear advance notice, and there is a legitimate business purpose.

KEY EXCEPTIONS AND RISKS:
1. ADA accommodations: Employees with anxiety disorders or PTSD may be entitled to camera-off as a reasonable accommodation
2. Privacy laws: California (CCPA), Illinois (BIPA), and EU member states under GDPR impose restrictions
3. Home environment: Capturing employees' home spaces raises consent issues in some jurisdictions

RECOMMENDED APPROACH: Permit camera-off with reasonable notice or as an ADA accommodation, and have employment counsel review before implementation.

This is not legal advice.`,
  },
  {
    label: "🏛️ EU AI Act",
    model: "gemini-2.5-flash",
    tags: "governance, eu-ai-act, compliance-check",
    prompt: `Our company uses an AI model to score loan applications. Does this make us subject to the EU AI Act?`,
    response: `Yes. A loan application scoring AI falls under the EU AI Act as a high-risk AI system.

WHY IT'S HIGH-RISK: Annex III explicitly lists "AI systems used to evaluate the creditworthiness of natural persons" as high-risk. This applies if EU residents use your product, regardless of where your company is based.

REQUIREMENTS:
- Risk management system throughout the AI lifecycle
- Documented bias testing on training data
- Detailed decision logs for auditability
- Human oversight for final credit decisions
- Register the system in the EU AI Act database before deployment

TIMELINE: High-risk obligations apply from August 2026. Penalties: up to €30M or 6% of global annual turnover.`,
  },
];

// ─── Small helpers ────────────────────────────────────────────────────────────

function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center text-muted-foreground/50 hover:text-muted-foreground transition-colors ml-1 align-middle">
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function StepBadge({ n, done, active }: { n: number; done: boolean; active: boolean }) {
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm border-2 transition-all ${
      done ? "bg-emerald-500 border-emerald-500 text-white" :
      active ? "border-primary text-primary bg-primary/10" :
      "border-muted-foreground/30 text-muted-foreground/50"
    }`}>
      {done ? <CheckCircle className="w-4 h-4" /> : n}
    </div>
  );
}

function ExplainBox({ title, children, color = "blue" }: { title: string; children: React.ReactNode; color?: "blue" | "emerald" | "amber" | "cyan" }) {
  const cls = {
    blue:    "border-primary/20 bg-primary/5 text-primary",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-600",
    amber:   "border-amber-400/30 bg-amber-50 text-amber-700",
    cyan:    "border-cyan-500/20 bg-cyan-500/5 text-cyan-600",
  }[color];
  return (
    <div className={`rounded-xl border p-3.5 ${cls}`}>
      <div className="text-xs font-bold mb-1">{title}</div>
      <div className="text-xs leading-relaxed opacity-80">{children}</div>
    </div>
  );
}

function HashRow({ label, value, tip }: { label: string; value: string; tip: string }) {
  const [expand, setExpand] = useState(false);
  return (
    <div className="flex items-start gap-2 text-xs font-mono">
      <Hash className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wide">
          {label}<InfoTip>{tip}</InfoTip>
          <button type="button" onClick={() => setExpand(v => !v)} className="ml-auto text-muted-foreground/40 hover:text-muted-foreground">
            {expand ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        </div>
        <div className="text-foreground break-all text-[11px]">
          {expand ? value : `${value.slice(0, 24)}…${value.slice(-8)}`}
        </div>
      </div>
    </div>
  );
}

// ─── Auth-required banner ────────────────────────────────────────────────────

function AuthRequired({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-50 p-4 flex gap-3 items-start">
      <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
      <div>
        <div className="text-sm font-bold text-amber-800 mb-0.5">Sign in to complete this step</div>
        <div className="text-xs text-amber-700 leading-relaxed mb-3">
          Creating cryptographic receipts requires a free account. Sign in with Replit — it takes about 5 seconds.
        </div>
        <button
          onClick={onLogin}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors"
        >
          <Shield className="w-3.5 h-3.5" />
          Sign in with Replit
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Receipt {
  id: string;
  promptHash: string;
  responseHash: string;
  chainHash: string;
  model: string;
  policyStatus: "pass" | "fail" | "pending";
  policyViolations: string[];
  prompt: string;
  response: string;
  createdAt: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TutorialPage() {
  const { login } = useAuth();

  const [prompt, setPrompt] = useState(SAMPLES[0].prompt);
  const [response, setResponse] = useState(SAMPLES[0].response);
  const [model, setModel] = useState(SAMPLES[0].model);
  const [tags, setTags] = useState(SAMPLES[0].tags);

  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);

  const [replaying, setReplaying] = useState(false);
  const [replayDone, setReplayDone] = useState(false);
  const [replayResponse, setReplayResponse] = useState<string | null>(null);

  const [samplesOpen, setSamplesOpen] = useState(true);

  function loadSample(s: typeof SAMPLES[0]) {
    setPrompt(s.prompt);
    setResponse(s.response);
    setModel(s.model);
    setTags(s.tags);
    setReceipt(null);
    setVerifyResult(null);
    setReplayDone(false);
    setMintError(null);
    setNeedsAuth(false);
    setSamplesOpen(false);
  }

  async function handleMint() {
    if (!prompt.trim() || !response.trim()) return;
    setMinting(true);
    setMintError(null);
    setNeedsAuth(false);
    setReceipt(null);
    setVerifyResult(null);
    setReplayDone(false);
    try {
      const res = await fetch("/api/interactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          response: response.trim(),
          model: model.trim() || "unknown",
          tags: tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        }),
      });
      if (res.status === 401) { setNeedsAuth(true); setMinting(false); return; }
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setReceipt(data);
    } catch (e: unknown) {
      setMintError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setMinting(false);
    }
  }

  async function handleVerify() {
    if (!receipt) return;
    setVerifying(true);
    try {
      const res = await fetch(`/api/interactions/${receipt.id}/verify`, { credentials: "include" });
      const data = await res.json();
      setVerifyResult(data.valid);
    } catch {
      setVerifyResult(false);
    } finally {
      setVerifying(false);
    }
  }

  async function handleReplay() {
    if (!receipt) return;
    setReplaying(true);
    try {
      const res = await fetch(`/api/interactions/${receipt.id}/replay`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setReplayResponse(data.replayedResponse ?? data.response ?? receipt.response);
      setReplayDone(true);
    } catch {
      setReplayResponse(receipt.response);
      setReplayDone(true);
    } finally {
      setReplaying(false);
    }
  }

  function restart() {
    setReceipt(null);
    setVerifyResult(null);
    setReplayDone(false);
    setReplayResponse(null);
    setMintError(null);
    setNeedsAuth(false);
    setSamplesOpen(true);
  }

  const step2Active = !!receipt;
  const step3Active = verifyResult !== null;
  const step4Active = replayDone;

  return (
    <div className="max-w-2xl space-y-6" data-testid="tutorial-page">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#1B3B6F" }}>
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">Step-by-Step Tutorial</h1>
            <span className="text-[11px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
              Guided Walkthrough
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Paste any AI conversation and watch it become a cryptographically signed receipt — in 4 steps.
          </p>
        </div>
      </div>

      {/* ── Progress overview ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { n: 1, label: "Paste", done: !!receipt, active: true },
          { n: 2, label: "Mint", done: !!receipt, active: true },
          { n: 3, label: "Verify", done: step3Active, active: step2Active },
          { n: 4, label: "Replay", done: step4Active, active: step3Active },
        ].map(s => (
          <div key={s.n} className={`rounded-xl border p-2.5 text-center transition-all ${
            s.done ? "border-emerald-500/30 bg-emerald-500/5" :
            s.active ? "border-primary/30 bg-primary/5" :
            "border-border bg-muted/20 opacity-50"
          }`}>
            <div className="flex justify-center mb-1">
              <StepBadge n={s.n} done={s.done} active={s.active} />
            </div>
            <div className={`text-xs font-semibold ${s.done ? "text-emerald-600" : s.active ? "text-primary" : "text-muted-foreground"}`}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          STEP 1 — Paste your AI conversation
      ════════════════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="tutorial-step1">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border" style={{ background: "linear-gradient(135deg,#1B3B6F08,#10B98108)" }}>
          <StepBadge n={1} done={!!receipt} active={true} />
          <div className="flex-1">
            <div className="font-bold text-foreground">Paste your AI conversation</div>
            <div className="text-xs text-muted-foreground">Add the prompt you sent and the AI's response — or load one of the 6 samples below</div>
          </div>
        </div>

        <div className="p-5 space-y-4">

          <ExplainBox title="Why do this?" color="blue">
            This is the conversation you want to preserve. Once you mint the receipt, the exact text of this prompt and response is cryptographically fingerprinted. Anyone can later prove the content hasn't been altered — without needing to trust a central authority.
          </ExplainBox>

          {/* Sample loader */}
          <div className="rounded-xl border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setSamplesOpen(v => !v)}
              className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/20 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="flex-1 text-left text-sm font-semibold text-foreground">Load a sample scenario</span>
              <span className="text-xs text-muted-foreground">6 real-world examples</span>
              {samplesOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {samplesOpen && (
              <div className="border-t border-border px-4 pb-4 pt-3">
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                  Each sample is a real AI governance scenario — legal, medical, financial, HR, journalism, or EU AI Act compliance. Click any to pre-fill the fields below.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SAMPLES.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => loadSample(s)}
                      className="text-left px-3 py-2.5 rounded-xl border border-border bg-background hover:border-primary/50 hover:bg-primary/5 transition-all text-xs font-semibold text-foreground"
                      data-testid={`tutorial-sample-${i}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Prompt field */}
          <div>
            <label className="flex items-center text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
              Prompt — what you asked the AI
              <InfoTip>The exact message you sent to the AI. This is hashed with SHA-256 to create a tamper-proof fingerprint.</InfoTip>
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={4}
              placeholder="Paste what you asked the AI..."
              className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              data-testid="tutorial-prompt"
            />
          </div>

          {/* Response field */}
          <div>
            <label className="flex items-center text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
              Response — what the AI said back
              <InfoTip>Paste the AI's full response. The receipt system hashes this text exactly — any change to even one character will break verification.</InfoTip>
            </label>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex gap-2 items-start mb-2">
              <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 leading-relaxed">
                Paste the <strong>complete</strong> AI response — don't edit or paraphrase it. The hash is computed from these exact bytes.
              </p>
            </div>
            <textarea
              value={response}
              onChange={e => setResponse(e.target.value)}
              rows={7}
              placeholder="Paste the AI's full response here..."
              className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
              data-testid="tutorial-response"
            />
          </div>

          {/* Model + tags row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
                AI model used
                <InfoTip>Which AI tool produced this response — e.g. gpt-4o, claude-3-5-sonnet, gemini-2.5-flash. Used for filtering and compliance reporting.</InfoTip>
              </label>
              <input
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="gpt-4o"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                data-testid="tutorial-model"
              />
            </div>
            <div>
              <label className="flex items-center text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
                Tags (optional)
                <InfoTip>Comma-separated labels for grouping receipts — e.g. "legal, contract, high-risk". Makes audit trails searchable.</InfoTip>
              </label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="legal, contract"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
                data-testid="tutorial-tags"
              />
            </div>
          </div>

          {/* Auth or error */}
          {needsAuth && <AuthRequired onLogin={login} />}
          {mintError && !needsAuth && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-700">
              {mintError}
            </div>
          )}

          {/* Mint button */}
          <button
            type="button"
            onClick={handleMint}
            disabled={minting || !prompt.trim() || !response.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg,#1B3B6F,#10B981)", color: "white" }}
            data-testid="tutorial-mint-btn"
          >
            {minting ? (
              <><RefreshCw className="w-4 h-4 animate-spin" />Minting receipt…</>
            ) : receipt ? (
              <><CheckCircle className="w-4 h-4" />Receipt minted — scroll down to continue</>
            ) : (
              <><Shield className="w-4 h-4" />Create Cryptographic Receipt<ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          STEP 2 — Receipt (shown after minting)
      ════════════════════════════════════════════════════════════════════════ */}
      <section className={`rounded-2xl border overflow-hidden transition-all ${receipt ? "border-emerald-500/30" : "border-border opacity-40"}`} data-testid="tutorial-step2">
        <div className={`flex items-center gap-3 px-5 py-4 border-b ${receipt ? "border-emerald-500/20 bg-emerald-500/5" : "border-border bg-muted/20"}`}>
          <StepBadge n={2} done={step3Active} active={!!receipt} />
          <div className="flex-1">
            <div className="font-bold text-foreground">Your cryptographic receipt</div>
            <div className="text-xs text-muted-foreground">
              {receipt ? "Receipt sealed — hashes computed and chain linked" : "Complete step 1 to mint your receipt"}
            </div>
          </div>
          {receipt && <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">SEALED ✓</span>}
        </div>

        {receipt && (
          <div className="p-5 space-y-4">
            <ExplainBox title="What just happened?" color="emerald">
              The system ran SHA-256 on your exact prompt text and response text, producing two unique fingerprints. It also computed a chain hash that links this receipt to the previous one — like a blockchain. Change even one character in the stored text and the hash won't match.
            </ExplainBox>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-600 font-bold">
                  <Shield className="w-4 h-4" /> RECEIPT SEALED
                </div>
                <span className="text-muted-foreground text-[10px]">{new Date(receipt.createdAt).toLocaleString()}</span>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-20">RECEIPT ID</span>
                  <span className="text-foreground truncate" data-testid="tutorial-receipt-id">{receipt.id}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-muted-foreground w-20">MODEL</span>
                  <span className="text-foreground">{receipt.model}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-muted-foreground w-20">POLICY</span>
                  <span className={receipt.policyStatus === "pass" ? "text-emerald-500" : receipt.policyStatus === "fail" ? "text-red-500" : "text-yellow-500"} data-testid="tutorial-policy-status">
                    {receipt.policyStatus.toUpperCase()}
                  </span>
                  <InfoTip>Policy rules scan this interaction against your governance rules — e.g. flagging prompt injection attempts or sensitive data leakage.</InfoTip>
                </div>
              </div>

              <div className="border-t border-emerald-500/20 pt-3 space-y-2.5">
                <HashRow
                  label="PROMPT HASH"
                  value={receipt.promptHash}
                  tip="SHA-256 of the exact prompt text. If the prompt is changed later, this hash won't match."
                />
                <HashRow
                  label="RESPONSE HASH"
                  value={receipt.responseHash ?? receipt.chainHash}
                  tip="SHA-256 of the AI's exact response. Proves the response text hasn't been altered."
                />
                <HashRow
                  label="CHAIN HASH"
                  value={receipt.chainHash}
                  tip="Incorporates the previous receipt's hash, chaining all receipts together. Tamper with any receipt and all subsequent links break."
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying || verifyResult !== null}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              data-testid="tutorial-verify-btn"
            >
              {verifying ? (
                <><RefreshCw className="w-4 h-4 animate-spin" />Re-computing hash…</>
              ) : verifyResult !== null ? (
                <><CheckCircle className="w-4 h-4" />Verified — scroll down</>
              ) : (
                <><CheckCircle className="w-4 h-4" />Verify the hash chain<ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          STEP 3 — Verify
      ════════════════════════════════════════════════════════════════════════ */}
      <section className={`rounded-2xl border overflow-hidden transition-all ${step3Active ? "border-primary/30" : "border-border opacity-40"}`} data-testid="tutorial-step3">
        <div className={`flex items-center gap-3 px-5 py-4 border-b ${step3Active ? "border-primary/20 bg-primary/5" : "border-border bg-muted/20"}`}>
          <StepBadge n={3} done={replayDone} active={step3Active} />
          <div className="flex-1">
            <div className="font-bold text-foreground">Verify the hash chain</div>
            <div className="text-xs text-muted-foreground">
              {step3Active ? "Hash re-computed and checked against the sealed receipt" : "Complete step 2 first"}
            </div>
          </div>
          {verifyResult !== null && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${verifyResult ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" : "text-red-600 bg-red-500/10 border-red-500/20"}`}>
              {verifyResult ? "VALID ✓" : "FAILED ✗"}
            </span>
          )}
        </div>

        {step3Active && (
          <div className="p-5 space-y-4">
            <ExplainBox title="How verification works" color="blue">
              The server re-ran SHA-256 on the stored prompt and response text, then compared the result against the hash sealed in the receipt. Because they match, you know with mathematical certainty that the data hasn't been changed since the receipt was minted.
            </ExplainBox>

            <div className={`rounded-xl border p-4 flex items-center gap-3 ${verifyResult ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <CheckCircle className={`w-6 h-6 flex-shrink-0 ${verifyResult ? "text-emerald-500" : "text-red-500"}`} />
              <div>
                <div className={`font-bold text-sm ${verifyResult ? "text-emerald-600" : "text-red-600"}`} data-testid="tutorial-verify-result">
                  {verifyResult ? "Chain verified — receipt is authentic" : "Verification failed — data may have been altered"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {verifyResult
                    ? "SHA-256 hash recomputed from stored data — matches sealed receipt exactly"
                    : "The stored hash does not match the recomputed hash"}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReplay}
              disabled={replaying || replayDone}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              data-testid="tutorial-replay-btn"
            >
              {replaying ? (
                <><RefreshCw className="w-4 h-4 animate-spin" />Replaying…</>
              ) : replayDone ? (
                <><CheckCircle className="w-4 h-4" />Replayed — scroll down</>
              ) : (
                <><RefreshCw className="w-4 h-4" />Replay this interaction<ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          STEP 4 — Replay
      ════════════════════════════════════════════════════════════════════════ */}
      <section className={`rounded-2xl border overflow-hidden transition-all ${step4Active ? "border-cyan-500/30" : "border-border opacity-40"}`} data-testid="tutorial-step4">
        <div className={`flex items-center gap-3 px-5 py-4 border-b ${step4Active ? "border-cyan-500/20 bg-cyan-500/5" : "border-border bg-muted/20"}`}>
          <StepBadge n={4} done={replayDone} active={step3Active} />
          <div className="flex-1">
            <div className="font-bold text-foreground">Replay the interaction</div>
            <div className="text-xs text-muted-foreground">
              {step4Active ? "Replay receipt minted and linked to original" : "Complete step 3 first"}
            </div>
          </div>
          {replayDone && <span className="text-xs font-bold text-cyan-600 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-full">REPLAYED ✓</span>}
        </div>

        {step4Active && receipt && (
          <div className="p-5 space-y-4">
            <ExplainBox title="What is replay?" color="cyan">
              Replay takes the original signed prompt, submits it to the AI again, and creates a second receipt that links back to the first. This proves the interaction was real. Auditors can compare both receipts over time to see if the AI's answers change — valuable evidence for compliance and accountability.
            </ExplainBox>

            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-cyan-600 font-bold text-sm">
                <RefreshCw className="w-4 h-4" /> REPLAY RECEIPT MINTED
              </div>
              <div>
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  Original response
                  <InfoTip>Sealed at mint time — this is exactly what was stored in step 1.</InfoTip>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-xs text-foreground leading-relaxed max-h-32 overflow-auto">
                  {receipt.response}
                </div>
              </div>
              {replayResponse && replayResponse !== receipt.response && (
                <div>
                  <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    Replayed response
                    <InfoTip>The AI's new response to the same prompt. Differences show AI non-determinism — both versions are now preserved as evidence.</InfoTip>
                  </div>
                  <div className="rounded-lg border border-cyan-500/20 bg-background p-3 text-xs text-cyan-700 leading-relaxed max-h-32 overflow-auto" data-testid="tutorial-replay-response">
                    {replayResponse}
                  </div>
                </div>
              )}
            </div>

            {/* Completion card */}
            <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span className="font-bold text-emerald-800">You've completed the full REPLAY cycle!</span>
              </div>
              <div className="space-y-1.5 text-xs text-emerald-700 mb-4">
                <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />Prompt and response cryptographically sealed with SHA-256</div>
                <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />Hash chain verified — data integrity confirmed</div>
                <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />Interaction replayed and second receipt minted</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={restart}
                  className="flex-1 rounded-xl border border-emerald-300 bg-white text-emerald-700 text-sm font-bold py-2.5 hover:bg-emerald-50 transition-colors"
                  data-testid="tutorial-restart-btn"
                >
                  Try another scenario
                </button>
                <a
                  href={`/receipts/${receipt.id}`}
                  className="flex-1 rounded-xl bg-emerald-600 text-white text-sm font-bold py-2.5 flex items-center justify-center gap-1.5 hover:bg-emerald-700 transition-colors"
                  data-testid="tutorial-view-receipt-btn"
                >
                  View full receipt <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
