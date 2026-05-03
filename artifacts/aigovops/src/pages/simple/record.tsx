import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateInteraction,
  getListInteractionsQueryKey,
  getGetStatsQueryKey,
  getGetChainQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Form, FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Loader2, ChevronRight, ChevronLeft, Mic, Info, Sparkles, ChevronDown, ChevronUp, Lock, Shield, ArrowRight } from "lucide-react";

// ─── Sample interactions users can load in one click ─────────────────────────

const SAMPLES = [
  {
    label: "⚖️ Legal",
    prompt: `Review this non-compete clause and tell me if it's enforceable: "Employee agrees not to work for any competitor within 50 miles for a period of 3 years following termination of employment."`,
    response: `This non-compete clause raises significant enforceability concerns under most U.S. jurisdictions.

1. Duration: 3 years is generally considered excessive. Courts in California, North Dakota, and Minnesota will void it entirely. Most states cap "reasonable" duration at 6–12 months for standard roles.

2. Geographic scope: "50 miles" may be reasonable for brick-and-mortar businesses but is difficult to apply to remote or digital roles where geography is irrelevant.

3. "Competitor" is undefined: Without a specific definition, this term is dangerously broad and likely unenforceable as written.

Recommendation: This clause would not survive judicial scrutiny in most states. Consult a licensed employment attorney before signing or enforcing it. I am an AI and this is not legal advice.`,
    model: "ChatGPT",
    tags: "legal, contract, high-risk",
  },
  {
    label: "🏥 Medical",
    prompt: `A patient presents with sudden onset chest pain radiating to the left arm, sweating, and nausea. What are the differential diagnoses and immediate steps?`,
    response: `This presentation is a classic STEMI pattern and must be treated as acute myocardial infarction until ruled out.

IMMEDIATE STEPS:
1. Call emergency services (911) immediately
2. Have the patient chew 325mg aspirin (if not allergic)
3. Keep the patient calm and seated
4. Do not allow the patient to walk or exert themselves
5. Prepare for CPR if the patient loses consciousness

DIFFERENTIAL DIAGNOSES:
- Acute MI (STEMI/NSTEMI) — must be ruled out first
- Aortic dissection — contraindicates thrombolytics
- Pulmonary embolism
- Pericarditis

⚠️ This AI output is informational only and does not replace clinical judgment.`,
    model: "Claude",
    tags: "medical, high-risk, triage",
  },
  {
    label: "📰 Fact-Check",
    prompt: `Is it accurate to write: "AI systems now make all hiring decisions at Fortune 500 companies"?`,
    response: `No, that statement is inaccurate and should not be published as written.

WHAT IS ACCURATE:
- Many Fortune 500 companies use AI tools to assist in early-stage resume screening
- AI is widely used to filter applications by keyword matching and qualifications

WHAT IS NOT ACCURATE:
- "All hiring decisions" is false — final decisions involve human managers by policy and by law
- The EU AI Act and several U.S. state laws require human oversight of AI hiring tools

SUGGESTED ACCURATE REWRITE:
"AI tools now assist in screening candidates at many Fortune 500 companies, though final hiring decisions remain with human managers."`,
    model: "Gemini",
    tags: "journalism, fact-check, editorial",
  },
  {
    label: "💰 Finance",
    prompt: `Should I put my entire retirement savings into NVIDIA stock right now?`,
    response: `I can't and shouldn't tell you to put all your retirement savings into any single stock.

CONCENTRATION RISK
Putting 100% into one stock violates a fundamental principle of portfolio management. NVIDIA fell ~66% in 2022 before its 2023–2024 recovery.

WHAT YOU SHOULD DO
1. Speak with a licensed fiduciary financial advisor before making any major retirement allocation change
2. Consider your time horizon and risk tolerance
3. If you want NVIDIA exposure, a capped allocation (5–15%) within a diversified portfolio is more defensible

I am an AI assistant. This is not personalized financial advice.`,
    model: "ChatGPT",
    tags: "finance, compliance",
  },
  {
    label: "👥 HR Policy",
    prompt: `Can we legally require all remote employees to have their cameras on during video calls?`,
    response: `This is a nuanced employment law question.

GENERALLY PERMISSIBLE in most U.S. at-will states when:
- The policy is applied consistently
- Employees receive clear advance notice

KEY EXCEPTIONS AND RISKS:
1. ADA accommodations: Employees with anxiety disorders or PTSD may be entitled to camera-off
2. Privacy laws: California (CCPA), Illinois (BIPA), and GDPR impose restrictions a camera-on policy may implicate
3. Home environment: Capturing employees' home spaces raises consent issues in some jurisdictions

RECOMMENDED APPROACH:
- Permit camera-off as an ADA accommodation
- Have employment counsel review before implementation

This is not legal advice.`,
    model: "Claude",
    tags: "hr, policy, employment-law",
  },
  {
    label: "🏛️ EU AI Act",
    prompt: `Our company uses an AI model to score loan applications. Does this make us subject to the EU AI Act?`,
    response: `Yes. A loan application scoring AI falls under the EU AI Act as a high-risk AI system.

WHY IT'S HIGH-RISK: Annex III explicitly lists "AI systems used to evaluate the creditworthiness of natural persons" as high-risk. This applies if EU residents use your product, regardless of where your company is based.

WHAT IS REQUIRED:
- Risk management system throughout the AI lifecycle
- Documented bias testing on training data
- Detailed decision logs for auditability
- Human oversight for final credit decisions
- Register the system in the EU AI Act database before deployment

TIMELINE: High-risk obligations apply from August 2026.
Penalties: up to €30M or 6% of global annual turnover.`,
    model: "Gemini",
    tags: "governance, eu-ai-act, compliance",
  },
];

// ─── Schema ───────────────────────────────────────────────────────────────────

const formSchema = z.object({
  prompt: z.string().min(1, "Please enter what you asked the AI"),
  response: z.string().min(1, "Please paste what the AI said back"),
  model: z.string().min(1, "Please enter the AI tool name"),
  tags: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const STEPS = [
  { id: "prompt", title: "What did you ask?", subtitle: "Paste or type what you sent to the AI", help: "This is your message to the AI. It will be cryptographically fingerprinted — so you can prove later that this is exactly what you asked." },
  { id: "response", title: "What did it say?", subtitle: "Paste the AI's full reply here", help: "Copy the entire AI response, word for word. The receipt system hashes this text exactly — any change to even one character will break the verification." },
  { id: "details", title: "A little more info", subtitle: "Just a quick detail to finish up", help: "Naming the AI tool helps with filtering and compliance reporting. Tags let you group related recordings for audits." },
];

const AI_TOOLS = ["ChatGPT", "Claude", "Gemini", "Copilot", "Other"];

function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center text-muted-foreground/50 hover:text-muted-foreground transition-colors ml-1">
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SimpleRecord() {
  const { login } = useAuth();
  const [step, setStep] = useState(0);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [minted, setMinted] = useState<{ id: string } | null>(null);
  const [minting, setMinting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { prompt: "", response: "", model: "ChatGPT", tags: "" },
  });

  const createInteraction = useCreateInteraction({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListInteractionsQueryKey({}) });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetChainQueryKey() });
        setMinted({ id: data.id });
        setMinting(false);
        setSubmitError(null);
        setNeedsAuth(false);
      },
      onError: (error: unknown) => {
        setMinting(false);
        const status = (error as { status?: number })?.status;
        if (status === 401) {
          setNeedsAuth(true);
          setSubmitError(null);
        } else {
          setNeedsAuth(false);
          setSubmitError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
        }
      },
    },
  });

  function loadSample(sample: typeof SAMPLES[0]) {
    form.setValue("prompt", sample.prompt);
    form.setValue("response", sample.response);
    form.setValue("model", sample.model);
    form.setValue("tags", sample.tags);
    setSamplesOpen(false);
    setStep(0);
  }

  async function goNext() {
    const stepFields: (keyof FormValues)[][] = [["prompt"], ["response"], ["model"]];
    const ok = await form.trigger(stepFields[step]);
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function onSubmit(values: FormValues) {
    setMinting(true);
    createInteraction.mutate({
      data: {
        prompt: values.prompt,
        response: values.response,
        model: values.model,
        tags: values.tags ? values.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      },
    });
  }

  if (minted) {
    return (
      <div className="max-w-sm mx-auto text-center space-y-6 pt-8" data-testid="simple-record-success">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">Recording saved!</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Your chat has been cryptographically sealed and added to your chain.
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-left space-y-2">
          <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Recording ID</div>
          <div className="text-sm font-mono text-foreground break-all">{minted.id}</div>
          <div className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-border">
            This ID links to a cryptographic receipt. Share it with anyone who needs to verify what was said.
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="rounded-xl" onClick={() => setLocation(`/receipts/${minted.id}`)}>
            View Receipt
          </Button>
          <Button className="rounded-xl" onClick={() => { setMinted(null); form.reset(); setStep(0); setSamplesOpen(true); }}>
            Record Another
          </Button>
        </div>
      </div>
    );
  }

  const currentStep = STEPS[step];

  return (
    <div className="max-w-sm mx-auto space-y-5 pt-2" data-testid="simple-record-page">

      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Mic className="w-6 h-6 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Record a Chat</h1>
        <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all ${
              i === step ? "w-6 bg-primary" : i < step ? "w-2 bg-primary/50" : "w-2 bg-border"
            }`}
          />
        ))}
      </div>

      {/* Sample loader — only on first step */}
      {step === 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setSamplesOpen(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/30 transition-colors"
          >
            <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="flex-1 text-left text-sm font-semibold text-foreground">Load a sample interaction</span>
            <span className="text-xs text-muted-foreground mr-1">6 examples</span>
            {samplesOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {samplesOpen && (
            <div className="border-t border-border px-3 pb-3 pt-2">
              <p className="text-xs text-muted-foreground mb-2.5 px-1">
                Choose a real-world AI conversation to see how it works — all three fields will be filled in for you.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {SAMPLES.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => loadSample(s)}
                    className="text-left px-3 py-2.5 rounded-xl border border-border bg-background hover:border-primary/40 hover:bg-primary/5 transition-all text-xs font-semibold text-foreground"
                    data-testid={`sample-${i}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step content */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div>
          <div className="flex items-start gap-1">
            <h2 className="text-lg font-bold text-foreground">{currentStep.title}</h2>
            <InfoTip>{currentStep.help}</InfoTip>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{currentStep.subtitle}</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {step === 0 && (
              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={5}
                        placeholder="e.g. Summarise the key risks in this contract..."
                        className="rounded-xl text-sm resize-none"
                        data-testid="simple-input-prompt"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {step === 1 && (
              <>
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 flex gap-2 items-start">
                  <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Paste the AI's <strong>full</strong> response — the more complete, the stronger the receipt. Any change to this text later will break verification.
                  </p>
                </div>
                <FormField
                  control={form.control}
                  name="response"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          {...field}
                          rows={7}
                          placeholder="Paste the AI's full response here..."
                          className="rounded-xl text-sm resize-none"
                          data-testid="simple-input-response"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-1 text-sm font-medium text-foreground mb-2">
                    Which AI tool did you use?
                    <InfoTip>This helps with filtering and compliance reporting — e.g. "show me all receipts from ChatGPT this month".</InfoTip>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {AI_TOOLS.map((tool) => (
                      <button
                        key={tool}
                        type="button"
                        onClick={() => form.setValue("model", tool)}
                        className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                          form.watch("model") === tool
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:border-primary/40"
                        }`}
                        data-testid={`simple-model-${tool.toLowerCase()}`}
                      >
                        {tool}
                      </button>
                    ))}
                  </div>
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem className="mt-2">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Or type any AI name..."
                            className="rounded-xl text-sm"
                            data-testid="simple-input-model"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-1 text-sm font-medium text-foreground mb-1.5">
                        Tags (optional)
                        <InfoTip>Comma-separated tags help you find and group receipts later — e.g. "legal, contract" or "hr, policy". Great for audit trails.</InfoTip>
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="legal, contract, high-risk"
                          className="rounded-xl text-sm"
                          data-testid="simple-input-tags"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Auth / error feedback — shown on last step */}
            {step === STEPS.length - 1 && needsAuth && (
              <div className="rounded-xl border border-amber-400/40 bg-amber-50 p-3.5 flex gap-3 items-start">
                <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-amber-800 mb-0.5">Sign in to save recordings</div>
                  <div className="text-xs text-amber-700 leading-relaxed mb-2.5">
                    Creating cryptographic receipts requires a free account. It takes about 5 seconds.
                  </div>
                  <button
                    type="button"
                    onClick={login}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors"
                    data-testid="record-signin-btn"
                  >
                    <Shield className="w-3 h-3" />
                    Sign in with Replit
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
            {step === STEPS.length - 1 && submitError && !needsAuth && (
              <div className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-700" data-testid="record-submit-error">
                {submitError}
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 pt-2">
              {step > 0 && (
                <Button type="button" variant="outline" className="flex-1 rounded-xl gap-2" onClick={() => setStep((s) => s - 1)}>
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button type="button" className="flex-1 rounded-xl gap-2" onClick={goNext} data-testid="simple-next-step">
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button type="submit" disabled={minting} className="flex-1 rounded-xl gap-2" data-testid="simple-submit-record">
                  {minting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                  ) : (
                    <>Save Recording ✓</>
                  )}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
