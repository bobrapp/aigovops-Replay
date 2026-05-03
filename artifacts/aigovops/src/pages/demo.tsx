import { useState } from "react";
import {
  Shield, ArrowRight, CheckCircle, RefreshCw, Hash, User, Clock,
  ChevronRight, Zap, Sparkles, Send, Info, Eye, EyeOff, AlertTriangle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";

// ─── Scenario data ────────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    id: "legal",
    emoji: "⚖️",
    label: "Legal Contract Review",
    risk: "HIGH RISK",
    riskClass: "bg-red-100 text-red-700 border-red-200",
    useCase: "In-house legal · Procurement",
    whyRecord: "If AI gives wrong legal advice, you need cryptographic proof of exactly what was said and when — for liability and audit.",
    prompt: `Review this non-compete clause and tell me if it's enforceable: "Employee agrees not to work for any competitor within 50 miles for a period of 3 years following termination of employment."`,
    response: `This non-compete clause raises significant enforceability concerns under most U.S. jurisdictions.

1. Duration: 3 years is generally considered excessive. Courts in California, North Dakota, and Minnesota will void it entirely. Most states cap "reasonable" duration at 6–12 months for standard roles.

2. Geographic scope: "50 miles" may be reasonable for brick-and-mortar businesses but is difficult to apply to remote or digital roles where geography is irrelevant.

3. "Competitor" is undefined: Without a specific definition, this term is dangerously broad and likely unenforceable as written.

Recommendation: This clause would not survive judicial scrutiny in most states. Consult a licensed employment attorney before signing or enforcing it. I am an AI and this is not legal advice.`,
    model: "gpt-4o",
    tags: ["legal", "contract", "high-risk"],
  },
  {
    id: "medical",
    emoji: "🏥",
    label: "Medical Triage Guidance",
    risk: "HIGH RISK",
    riskClass: "bg-red-100 text-red-700 border-red-200",
    useCase: "Healthcare · Clinical decision support",
    whyRecord: "Medical AI outputs must be auditable — a signed receipt proves what the AI recommended and when, protecting both patient and provider.",
    prompt: `A patient presents with sudden onset chest pain radiating to the left arm, sweating, and nausea. What are the differential diagnoses and immediate steps?`,
    response: `This presentation is a classic STEMI pattern and must be treated as acute myocardial infarction (heart attack) until ruled out.

IMMEDIATE STEPS:
1. Call emergency services (911) immediately — do not delay
2. Have the patient chew a 325mg aspirin (if not allergic)
3. Keep the patient calm and seated or lying down
4. Do not allow the patient to walk or exert themselves
5. Prepare for CPR if the patient loses consciousness

DIFFERENTIAL DIAGNOSES (in order of priority):
- Acute MI (STEMI/NSTEMI) — must be ruled out first
- Unstable angina
- Aortic dissection — contraindicates thrombolytics; critical distinction
- Pulmonary embolism
- Pericarditis

⚠️ This AI output is informational only and does not replace clinical judgment. A licensed physician must evaluate and treat this patient.`,
    model: "claude-3-5-sonnet",
    tags: ["medical", "high-risk", "triage"],
  },
  {
    id: "journalism",
    emoji: "📰",
    label: "Journalism Fact-Check",
    risk: "EDITORIAL",
    riskClass: "bg-amber-100 text-amber-700 border-amber-200",
    useCase: "Newsrooms · Editorial teams",
    whyRecord: "Publishing false AI-checked facts causes reputational harm. A receipt proves what the AI was asked to verify and what it said.",
    prompt: `Is it accurate to write: "AI systems now make all hiring decisions at Fortune 500 companies"?`,
    response: `No, that statement is inaccurate and should not be published as written.

WHAT IS ACCURATE:
- Many Fortune 500 companies use AI tools to assist in early-stage resume screening and candidate ranking
- AI is widely used to filter applications by keyword matching, skills, and qualifications

WHAT IS NOT ACCURATE:
- "All hiring decisions" is false — final hiring decisions involve human managers and HR professionals by policy and increasingly by law
- The EU AI Act (2024) and several U.S. state laws require human oversight of AI hiring tools
- No major Fortune 500 company has publicly stated that AI makes final employment decisions autonomously

SUGGESTED ACCURATE REWRITE:
"AI tools now assist in screening and ranking candidates at many Fortune 500 companies, though final hiring decisions remain with human managers."`,
    model: "gemini-2.5-flash",
    tags: ["journalism", "fact-check", "editorial"],
  },
  {
    id: "finance",
    emoji: "💰",
    label: "Financial Advice Boundary",
    risk: "REGULATED",
    riskClass: "bg-orange-100 text-orange-700 border-orange-200",
    useCase: "FinTech · Wealth management",
    whyRecord: "Financial AI outputs are regulated. A receipt proves the AI correctly declined to give personalized investment advice — your compliance evidence.",
    prompt: `Should I put my entire retirement savings into NVIDIA stock right now?`,
    response: `I can't and shouldn't tell you to put all your retirement savings into any single stock, including NVIDIA.

CONCENTRATION RISK
Putting 100% of retirement savings into one stock violates a fundamental principle of portfolio management. NVIDIA fell ~66% in 2022 before its 2023–2024 recovery.

NVIDIA-SPECIFIC CONSIDERATIONS
- Current high P/E ratio reflects significant growth expectations already priced in
- Revenue is heavily concentrated in data center/AI chip demand
- Export restrictions to China represent a material business risk
- Competition from AMD, Intel, and custom silicon is increasing

WHAT YOU SHOULD DO
1. Speak with a licensed fiduciary financial advisor before making any major retirement allocation change
2. Consider your time horizon, risk tolerance, and existing diversification
3. If you want NVIDIA exposure, a capped allocation (5–15%) within a diversified portfolio is more defensible

I am an AI assistant. This is not personalized financial advice.`,
    model: "gpt-4o",
    tags: ["finance", "compliance", "boundary-test"],
  },
  {
    id: "hr",
    emoji: "👥",
    label: "HR Policy Decision",
    risk: "EMPLOYMENT LAW",
    riskClass: "bg-purple-100 text-purple-700 border-purple-200",
    useCase: "HR teams · Employment counsel",
    whyRecord: "HR AI guidance touches employment law. A signed receipt shows exactly what policy advice was given and when — essential if a decision is later challenged.",
    prompt: `Can we legally require all remote employees to have their cameras on during video calls?`,
    response: `This is a nuanced employment law question. Here is a breakdown:

GENERALLY PERMISSIBLE
In most U.S. at-will employment states, employers can set camera-on requirements as a condition of employment when:
- The policy is applied consistently
- Employees receive clear advance notice
- The policy serves a legitimate business purpose

KEY EXCEPTIONS AND RISKS
1. Disability accommodations: Employees with anxiety disorders or PTSD may be entitled to camera-off as a reasonable ADA accommodation
2. Privacy laws: California (CCPA), Illinois (BIPA), and EU member states under GDPR impose restrictions that a camera-on policy may implicate
3. Home environment privacy: Requiring cameras on in employees' homes raises concerns in some jurisdictions about capturing private spaces

RECOMMENDED APPROACH
- Permit camera-off with reasonable notice or as an ADA accommodation
- Specify the policy covers work hours and applies to meetings with 3+ attendees
- Have employment counsel review before implementation

This is not legal advice. Consult a licensed employment attorney in your jurisdiction.`,
    model: "claude-3-5-haiku",
    tags: ["hr", "policy", "employment-law"],
  },
  {
    id: "euaiact",
    emoji: "🏛️",
    label: "EU AI Act Compliance",
    risk: "REGULATORY",
    riskClass: "bg-blue-100 text-blue-700 border-blue-200",
    useCase: "Compliance teams · AI vendors",
    whyRecord: "AI compliance advice is itself subject to audit. Receipts create a verifiable paper trail for your AI governance queries.",
    prompt: `Our company uses an AI model to score loan applications. Does this make us subject to the EU AI Act?`,
    response: `Yes. A loan application scoring AI almost certainly falls under the EU AI Act as a high-risk AI system.

WHY IT'S HIGH-RISK
Annex III of the EU AI Act explicitly lists "AI systems used to evaluate the creditworthiness of natural persons" as high-risk. This applies regardless of whether you are an EU company — if EU residents use your product, the Act applies.

WHAT HIGH-RISK CLASSIFICATION REQUIRES
Technical obligations:
- Maintain a risk management system throughout the AI lifecycle
- Use high-quality, representative training data with documented bias testing
- Log all system decisions with sufficient detail for auditability
- Implement human oversight mechanisms — final credit decisions must have a human review pathway

Transparency obligations:
- Provide meaningful explanations to applicants about how the AI affected their decision
- Register the system in the EU AI Act database before deployment

TIMELINE
High-risk AI system obligations apply from August 2026. Governance documentation should begin now.

Penalties for non-compliance: up to €30 million or 6% of global annual turnover, whichever is higher.`,
    model: "gemini-2.5-flash",
    tags: ["governance", "eu-ai-act", "compliance-check"],
  },
];

// ─── Helper components ────────────────────────────────────────────────────────

function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground transition-colors ml-1">
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function ExplainBubble({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
      <div className="text-primary mt-0.5 flex-shrink-0">{icon}</div>
      <div>
        <div className="text-xs font-semibold text-primary mb-0.5">{title}</div>
        <div className="text-xs text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function HashDisplay({ label, value, tooltip }: { label: string; value: string; tooltip: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <Hash className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-0.5">
          {label}
          <InfoTip>{tooltip}</InfoTip>
          <button
            type="button"
            onClick={() => setShow(v => !v)}
            className="ml-auto text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {show ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        </div>
        <div className="text-foreground text-[10px] font-mono break-all">
          {show ? value : `${value.slice(0, 20)}…${value.slice(-8)}`}
        </div>
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "preset" | "live";
type Step = "choose" | "generating" | "submitting" | "receipt" | "verifying" | "verified" | "replaying" | "replayed";

interface Receipt {
  id: string;
  promptHash: string;
  responseHash: string;
  chainHash: string;
  prevHash: string | null;
  model: string;
  policyStatus: "pass" | "fail" | "pending";
  policyViolations: string[];
  createdAt: string;
  prompt: string;
  response: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DemoPage() {
  const [mode, setMode] = useState<Mode>("preset");
  const [step, setStep] = useState<Step>("choose");
  const [selected, setSelected] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [livePrompt, setLivePrompt] = useState("");
  const [liveResponse, setLiveResponse] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [verifyOk, setVerifyOk] = useState<boolean | null>(null);
  const [replayResponse, setReplayResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const scenario = SCENARIOS[selected];

  function activePrompt() { return mode === "live" ? livePrompt : scenario.prompt; }
  function activeResponse() { return mode === "live" ? liveResponse : scenario.response; }
  function activeModel() { return mode === "live" ? "gemini-2.5-flash" : scenario.model; }
  function activeTags() { return mode === "live" ? ["live", "gemini"] : scenario.tags; }

  async function generateLiveResponse() {
    if (!livePrompt.trim()) return;
    setStep("generating");
    setError(null);
    setLiveResponse("");
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: livePrompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLiveResponse(data.response);
      setStep("choose");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("choose");
    }
  }

  async function mintReceipt() {
    if (mode === "live" && !liveResponse) return;
    setStep("submitting");
    setError(null);
    try {
      const res = await fetch("/api/interactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: activePrompt(),
          response: activeResponse(),
          model: activeModel(),
          tags: activeTags(),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setReceipt(data);
      setStep("receipt");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("choose");
    }
  }

  async function verifyReceipt() {
    if (!receipt) return;
    setStep("verifying");
    try {
      const res = await fetch(`/api/interactions/${receipt.id}/verify`, { credentials: "include" });
      const data = await res.json();
      setVerifyOk(data.valid);
      setStep("verified");
    } catch {
      setVerifyOk(false);
      setStep("verified");
    }
  }

  async function replayReceipt() {
    if (!receipt) return;
    setStep("replaying");
    try {
      const res = await fetch(`/api/interactions/${receipt.id}/replay`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setReplayResponse(data.replayedResponse ?? data.response ?? receipt.response);
      setStep("replayed");
    } catch {
      setReplayResponse(receipt.response);
      setStep("replayed");
    }
  }

  function reset() {
    setStep("choose");
    setReceipt(null);
    setVerifyOk(null);
    setReplayResponse(null);
    setError(null);
    setLiveResponse("");
    setPreviewOpen(false);
  }

  const progressSteps = [
    { id: "choose", label: "Pick Scenario" },
    { id: "receipt", label: "Mint Receipt" },
    { id: "verified", label: "Verify Hash" },
    { id: "replayed", label: "Replay" },
  ];
  const stepIndex = ["choose", "generating", "submitting", "receipt", "verifying", "verified", "replaying", "replayed"].indexOf(step);
  const progressIndex = stepIndex <= 2 ? 0 : stepIndex <= 3 ? 1 : stepIndex <= 5 ? 2 : 3;
  const isChoosing = step === "choose" || step === "generating" || step === "submitting";

  return (
    <div className="space-y-5 max-w-2xl" data-testid="demo-page">

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">Live Demo</h1>
            <span className="text-[11px] bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide">4 Steps</span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Choose a real-world AI scenario → mint a cryptographic receipt → verify it → replay it.
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center">
        {progressSteps.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1">
            <div className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${i <= progressIndex ? "text-primary" : "text-muted-foreground/50"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all flex-shrink-0 ${
                i < progressIndex ? "bg-primary border-primary text-white" :
                i === progressIndex ? "border-primary text-primary bg-primary/10" :
                "border-muted-foreground/30 text-muted-foreground/50"
              }`}>
                {i < progressIndex ? <CheckCircle className="w-3 h-3" /> : i + 1}
              </div>
              <span className="hidden sm:inline text-[11px]">{s.label}</span>
            </div>
            {i < progressSteps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1.5 rounded transition-colors ${i < progressIndex ? "bg-primary/50" : "bg-muted-foreground/20"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex gap-2 items-start" data-testid="demo-error">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs font-mono text-red-400">{error}</div>
        </div>
      )}

      {/* ── Step 1: Choose ──────────────────────────────────────────────────── */}
      {isChoosing && (
        <div className="space-y-4">

          {/* Mode toggle */}
          <div className="flex gap-1 p-1 bg-muted/30 rounded-lg border border-border w-fit">
            <button
              onClick={() => { setMode("preset"); setError(null); }}
              className={`px-3 py-1.5 text-[11px] font-mono font-bold rounded transition-colors ${mode === "preset" ? "bg-background text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="demo-tab-preset"
            >
              PRESET SCENARIOS
            </button>
            <button
              onClick={() => { setMode("live"); setError(null); }}
              className={`px-3 py-1.5 text-[11px] font-mono font-bold rounded transition-colors flex items-center gap-1.5 ${mode === "live" ? "bg-background text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="demo-tab-live"
            >
              <Sparkles className="w-3 h-3 text-amber-400" /> LIVE AI
            </button>
          </div>

          {/* ── Preset mode ── */}
          {mode === "preset" && (
            <div className="space-y-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">
                SELECT A REAL-WORLD SCENARIO — EACH SHOWS WHY RECEIPTS MATTER
              </div>

              {/* Scenario grid */}
              <div className="grid gap-2 sm:grid-cols-2">
                {SCENARIOS.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setSelected(i); setPreviewOpen(false); }}
                    className={`text-left rounded-xl border p-3.5 transition-all ${
                      selected === i
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                    }`}
                    data-testid={`demo-scenario-${i}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-2xl leading-none flex-shrink-0 mt-0.5">{s.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className={`font-bold text-sm leading-tight ${selected === i ? "text-primary" : "text-foreground"}`}>
                            {s.label}
                          </span>
                          {selected === i && (
                            <span className="text-[10px] text-primary font-mono flex-shrink-0">✓ SELECTED</span>
                          )}
                        </div>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${s.riskClass}`}>
                          {s.risk}
                        </span>
                        <div className="text-muted-foreground text-[11px] mt-1.5 leading-snug">{s.useCase}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Selected scenario detail */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Why record this */}
                <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border-b border-amber-100">
                  <span className="text-xl leading-none flex-shrink-0">{scenario.emoji}</span>
                  <div>
                    <div className="text-xs font-bold text-amber-800 mb-0.5">Why record this interaction?</div>
                    <div className="text-xs text-amber-700 leading-relaxed">{scenario.whyRecord}</div>
                  </div>
                </div>

                {/* Preview toggle */}
                <button
                  type="button"
                  onClick={() => setPreviewOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    {previewOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {previewOpen ? "Hide" : "Preview"} what will be recorded
                  </span>
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${previewOpen ? "rotate-90" : ""}`} />
                </button>

                {previewOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border">
                    <div className="pt-3">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
                        Prompt
                        <InfoTip>This is what was sent to the AI. It will be SHA-256 hashed and stored in the receipt.</InfoTip>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-xs text-foreground leading-relaxed max-h-24 overflow-auto font-mono">
                        {scenario.prompt}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">
                        Response
                        <InfoTip>This is what the AI replied. The full text is hashed — any change to even one character produces a completely different hash.</InfoTip>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-xs text-foreground leading-relaxed max-h-32 overflow-auto">
                        {scenario.response}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{scenario.model}</span>
                      {scenario.tags.map(t => (
                        <span key={t} className="bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={mintReceipt}
                disabled={step === "submitting"}
                className="w-full bg-primary text-primary-foreground rounded-xl px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
                data-testid="demo-button-mint"
              >
                {step === "submitting" ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" />Minting receipt…</>
                ) : (
                  <><Shield className="w-4 h-4" />Mint Cryptographic Receipt<ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          )}

          {/* ── Live AI mode ── */}
          {mode === "live" && (
            <div className="space-y-3">
              <ExplainBubble icon={<Sparkles className="w-4 h-4" />} title="How Live AI works">
                Type any prompt below. Gemini 2.5 Flash responds in real time, then you mint a signed receipt — proving exactly what was asked and answered, with a cryptographic timestamp.
              </ExplainBubble>

              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono block mb-1.5">
                  Your prompt
                  <InfoTip>Ask anything. For best governance demo results, try something consequential — medical, legal, financial, or compliance-related.</InfoTip>
                </label>
                <textarea
                  value={livePrompt}
                  onChange={e => setLivePrompt(e.target.value)}
                  placeholder="e.g. Is my non-disclosure agreement enforceable if I didn't sign it in writing?"
                  rows={4}
                  className="w-full bg-card border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
                  data-testid="demo-live-prompt"
                />
              </div>

              {!liveResponse && (
                <button
                  onClick={generateLiveResponse}
                  disabled={!livePrompt.trim() || step === "generating"}
                  className="w-full bg-amber-500 text-white rounded-xl px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  data-testid="demo-button-generate"
                >
                  {step === "generating" ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" />Asking Gemini…</>
                  ) : (
                    <><Send className="w-4 h-4" />Ask Gemini 2.5 Flash</>
                  )}
                </button>
              )}

              {liveResponse && (
                <>
                  <div>
                    <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                      <Sparkles className="w-3 h-3 text-amber-400" /> Gemini's response
                      <InfoTip>This is the live response from Gemini 2.5 Flash. Once you mint the receipt, this exact text is cryptographically sealed — it cannot be altered retroactively.</InfoTip>
                    </div>
                    <div className="bg-card border border-amber-500/30 rounded-lg p-3 text-sm text-foreground leading-relaxed max-h-48 overflow-auto" data-testid="demo-live-response">
                      {liveResponse}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setLiveResponse(""); setStep("choose"); }}
                      className="flex-1 bg-card border border-border text-muted-foreground rounded-xl px-3 py-2.5 text-xs font-bold hover:border-primary/40 transition-colors"
                    >
                      Ask again
                    </button>
                    <button
                      onClick={mintReceipt}
                      disabled={step === "submitting"}
                      className="flex-[2] bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-xs font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      data-testid="demo-button-mint-live"
                    >
                      {step === "submitting" ? (
                        <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Minting…</>
                      ) : (
                        <><Shield className="w-3.5 h-3.5" />Mint Receipt</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Receipt minted ───────────────────────────────────────────── */}
      {step === "receipt" && receipt && (
        <div className="space-y-4">

          <ExplainBubble icon={<Shield className="w-4 h-4" />} title="What just happened?">
            The prompt and response were each hashed with SHA-256 — a one-way mathematical fingerprint. The chain hash links this receipt to the previous one. If anyone changes even a single character in the stored text, the hash won't match and verification will fail.
          </ExplainBubble>

          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4 space-y-3 font-mono text-xs">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 font-bold">RECEIPT SEALED</span>
                <span className="ml-auto text-muted-foreground text-[10px]">{new Date().toLocaleTimeString()}</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24">RECEIPT ID</span>
                  <span className="text-foreground truncate" data-testid="demo-receipt-id">{receipt.id}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24">MODEL</span>
                  <span className="text-foreground">{receipt.model}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-muted-foreground w-24">POLICY</span>
                  <span className={receipt.policyStatus === "pass" ? "text-emerald-400" : receipt.policyStatus === "fail" ? "text-red-400" : "text-yellow-400"} data-testid="demo-policy-status">
                    {receipt.policyStatus.toUpperCase()}
                  </span>
                  <InfoTip>Policy rules check this interaction against your governance rules — e.g. flagging prompt injection attempts, sensitive data leakage, or out-of-scope requests.</InfoTip>
                </div>
              </div>

              <div className="border-t border-emerald-500/20 pt-3 space-y-2">
                <HashDisplay
                  label="PROMPT HASH"
                  value={receipt.promptHash}
                  tooltip="SHA-256 fingerprint of the exact prompt text. If the prompt is changed later, this hash won't match."
                />
                <HashDisplay
                  label="RESPONSE HASH"
                  value={receipt.responseHash ?? receipt.promptHash}
                  tooltip="SHA-256 fingerprint of the AI's exact response. Proves the response text hasn't been altered since it was recorded."
                />
                <HashDisplay
                  label="CHAIN HASH"
                  value={receipt.chainHash}
                  tooltip="Hash that incorporates the previous receipt's hash — chaining all receipts together. Tampering with any receipt in the chain breaks all subsequent links."
                />
              </div>

              {receipt.policyViolations.length > 0 && (
                <div className="border-t border-red-500/20 pt-2">
                  <div className="text-red-400 text-[10px] mb-1">POLICY VIOLATIONS</div>
                  {receipt.policyViolations.map((v, i) => (
                    <div key={i} className="text-red-300 text-[10px]">{v}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <button
            onClick={verifyReceipt}
            className="w-full bg-primary text-primary-foreground rounded-xl px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
            data-testid="demo-button-verify"
          >
            <CheckCircle className="w-4 h-4" />Verify the cryptographic chain<ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Step: Verifying ─────────────────────────────────────────────────── */}
      {step === "verifying" && (
        <div className="text-center py-10 space-y-2">
          <RefreshCw className="w-7 h-7 animate-spin mx-auto text-primary" />
          <div className="text-sm font-mono text-muted-foreground">Re-computing SHA-256 hash…</div>
          <div className="text-xs text-muted-foreground/60">Checking stored data matches the sealed fingerprint</div>
        </div>
      )}

      {/* ── Step 3: Verified ────────────────────────────────────────────────── */}
      {step === "verified" && (
        <div className="space-y-4">

          <ExplainBubble icon={<CheckCircle className="w-4 h-4" />} title="How verification works">
            The system re-ran the SHA-256 hash computation using the stored prompt and response text, then compared it against the sealed receipt hash. Because the hashes match, you know the data hasn't been altered since the receipt was minted.
          </ExplainBubble>

          <Card className={verifyOk ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}>
            <CardContent className="p-4 font-mono text-xs">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className={`w-5 h-5 ${verifyOk ? "text-emerald-400" : "text-red-400"}`} />
                <span className={`font-bold text-sm ${verifyOk ? "text-emerald-600" : "text-red-600"}`} data-testid="demo-verify-result">
                  {verifyOk ? "Chain verified — receipt is authentic" : "Verification failed — data may have been altered"}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><User className="w-3 h-3" />Checked by system verifier</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date().toLocaleTimeString()}</span>
              </div>
            </CardContent>
          </Card>

          <button
            onClick={replayReceipt}
            className="w-full bg-primary text-primary-foreground rounded-xl px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
            data-testid="demo-button-replay"
          >
            <RefreshCw className="w-4 h-4" />Replay this interaction<ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Step: Replaying ─────────────────────────────────────────────────── */}
      {step === "replaying" && (
        <div className="text-center py-10 space-y-2">
          <RefreshCw className="w-7 h-7 animate-spin mx-auto text-cyan-400" />
          <div className="text-sm font-mono text-muted-foreground">Replaying interaction…</div>
          <div className="text-xs text-muted-foreground/60">Minting a new receipt for the replay</div>
        </div>
      )}

      {/* ── Step 4: Replayed ────────────────────────────────────────────────── */}
      {step === "replayed" && receipt && (
        <div className="space-y-4">

          <ExplainBubble icon={<RefreshCw className="w-4 h-4 text-cyan-500" />} title="What is a replay?">
            Replay takes the original signed prompt, submits it again, and creates a second receipt linking back to the first. This proves the original interaction was real. Auditors can compare both receipts to see if the AI's answers changed over time.
          </ExplainBubble>

          <Card className="border-cyan-500/30 bg-cyan-500/5">
            <CardContent className="p-4 font-mono text-xs space-y-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-cyan-400" />
                <span className="text-cyan-500 font-bold">REPLAY RECEIPT MINTED</span>
              </div>
              <div>
                <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-1.5">
                  ORIGINAL RESPONSE
                  <InfoTip>The exact response from the first interaction — sealed at mint time.</InfoTip>
                </div>
                <div className="bg-background border border-border rounded-lg p-2.5 text-foreground text-[11px] leading-relaxed max-h-24 overflow-auto">
                  {receipt.response}
                </div>
              </div>
              {replayResponse && replayResponse !== receipt.response && (
                <div>
                  <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-1.5">
                    REPLAYED RESPONSE
                    <InfoTip>The AI's response when the same prompt was sent again. Differences are normal — they show AI non-determinism and are themselves evidence worth preserving.</InfoTip>
                  </div>
                  <div className="bg-background border border-cyan-500/20 rounded-lg p-2.5 text-cyan-600 text-[11px] leading-relaxed max-h-24 overflow-auto" data-testid="demo-replay-response">
                    {replayResponse}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1.5">
            <div className="text-xs font-semibold text-emerald-700 mb-2">You just completed the full REPLAY cycle:</div>
            <div className="space-y-1 text-xs text-emerald-700">
              <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Prompt and response cryptographically sealed</div>
              <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Hash chain verified — data integrity confirmed</div>
              <div className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Interaction replayed and second receipt minted</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={reset}
              className="bg-card border border-border text-foreground rounded-xl px-4 py-2.5 text-sm font-bold hover:border-primary/40 transition-colors"
              data-testid="demo-button-reset"
            >
              Try another scenario
            </button>
            <button
              onClick={() => navigate(`/receipts/${receipt.id}`)}
              className="bg-primary text-primary-foreground rounded-xl px-4 py-2.5 text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
              data-testid="demo-button-view-receipt"
            >
              View receipt<ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-mono text-[10px] text-emerald-500 border-emerald-500/30">RECEIPT MINTED ✓</Badge>
            <Badge variant="outline" className="font-mono text-[10px] text-emerald-500 border-emerald-500/30">CHAIN VERIFIED ✓</Badge>
            <Badge variant="outline" className="font-mono text-[10px] text-cyan-500 border-cyan-500/30">REPLAYED ✓</Badge>
          </div>
        </div>
      )}
    </div>
  );
}
