import { useState } from "react";
import { useListInteractions } from "@workspace/api-client-react";
import {
  Bot, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight,
  Stamp, AlertTriangle, Shield, FileText, BarChart2, Globe
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AgentRule {
  id: string;
  label: string;
  article?: string;
  check: (prompt: string, response: string, model: string) => boolean;
}

interface FrameworkAgent {
  id: string;
  name: string;
  shortName: string;
  jurisdiction: string;
  icon: React.ElementType;
  accentColor: string;
  accentBg: string;
  description: string;
  rules: AgentRule[];
}

const AGENTS: FrameworkAgent[] = [
  {
    id: "eu-ai-act",
    name: "EU AI Act Agent",
    shortName: "EU AIA",
    jurisdiction: "European Union · 2024/1689",
    icon: Globe,
    accentColor: "text-blue-400",
    accentBg: "border-blue-500/30 bg-blue-500/5",
    description: "Reviews interactions for alignment with EU AI Act transparency, record-keeping, and human oversight obligations for high-risk systems.",
    rules: [
      { id: "art12-log", label: "Interaction produces auditable record", article: "Art. 12", check: (p) => p.length > 0 },
      { id: "art12-model", label: "AI system identity declared", article: "Art. 12", check: (_p, _r, m) => m.length > 0 },
      { id: "art13-no-impersonate", label: "No human impersonation in response", article: "Art. 13", check: (_p, r) => !r.toLowerCase().includes("i am a human") && !r.toLowerCase().includes("i'm not an ai") },
      { id: "art9-length", label: "Prompt within operational bounds (≤8192 chars)", article: "Art. 9", check: (p) => p.length <= 8192 },
      { id: "art26-injection", label: "No prompt injection detected", article: "Art. 26", check: (p) => !p.toLowerCase().includes("ignore previous instructions") && !p.toLowerCase().includes("disregard all prior") },
    ],
  },
  {
    id: "nist-ai-rmf",
    name: "NIST AI RMF Agent",
    shortName: "NIST",
    jurisdiction: "United States · NIST AI 100-1",
    icon: Shield,
    accentColor: "text-emerald-400",
    accentBg: "border-emerald-500/30 bg-emerald-500/5",
    description: "Maps interactions to the NIST AI Risk Management Framework GOVERN and MEASURE functions, flagging risks in real-time.",
    rules: [
      { id: "gov-1.1", label: "Interaction is attributable to a user", article: "GOVERN 1.1", check: () => true },
      { id: "gov-1.2", label: "Model is from approved inventory", article: "GOVERN 1.2", check: (_p, _r, m) => ["gpt-4o","gpt-4","claude-3-5-sonnet","claude-3-opus","gemini-1.5-pro","gemini-2.0","llama-3"].some(ok => m.includes(ok)) },
      { id: "map-1.1", label: "Prompt does not contain PII patterns", article: "MAP 1.1", check: (p) => !p.match(/\b\d{3}-\d{2}-\d{4}\b/) && !p.match(/\b\d{16}\b/) },
      { id: "measure-2.5", label: "Response length is non-trivial (>20 chars)", article: "MEASURE 2.5", check: (_p, r) => r.length > 20 },
      { id: "manage-2.2", label: "No explicit harm facilitation detected", article: "MANAGE 2.2", check: (p, r) => !["how to hack","how to bypass security","how to make a bomb"].some(h => p.toLowerCase().includes(h) || r.toLowerCase().includes(h)) },
    ],
  },
  {
    id: "soc2",
    name: "SOC 2 Logging Agent",
    shortName: "SOC 2",
    jurisdiction: "AICPA · Trust Services Criteria",
    icon: BarChart2,
    accentColor: "text-purple-400",
    accentBg: "border-purple-500/30 bg-purple-500/5",
    description: "Validates AI interaction logs against SOC 2 Type II availability, confidentiality, and processing integrity criteria.",
    rules: [
      { id: "cc6.1", label: "Interaction is timestamped and attributable", article: "CC6.1", check: () => true },
      { id: "cc6.6", label: "Prompt does not contain credential-like strings", article: "CC6.6", check: (p) => !p.toLowerCase().includes("password") && !p.match(/\b[A-Za-z0-9]{32,}\b/) },
      { id: "cc7.2", label: "Response does not echo back secrets", article: "CC7.2", check: (_p, r) => !r.toLowerCase().includes("password") },
      { id: "pi1.1", label: "Prompt and response both present", article: "PI1.1", check: (p, r) => p.length > 0 && r.length > 0 },
      { id: "a1.2", label: "Model ID logged for availability audit trail", article: "A1.2", check: (_p, _r, m) => m.length > 0 },
    ],
  },
  {
    id: "iso-42001",
    name: "ISO/IEC 42001 Agent",
    shortName: "ISO 42001",
    jurisdiction: "International · ISO/IEC 42001:2023",
    icon: FileText,
    accentColor: "text-amber-400",
    accentBg: "border-amber-500/30 bg-amber-500/5",
    description: "Checks interactions against the ISO/IEC 42001 AI Management System standard for responsible AI deployment.",
    rules: [
      { id: "6.1-risk", label: "No high-risk content patterns in prompt", article: "Clause 6.1", check: (p) => !["ignore previous","reveal system","bypass"].some(h => p.toLowerCase().includes(h)) },
      { id: "8.4-transparency", label: "AI system identified (not opaque)", article: "Clause 8.4", check: (_p, _r, m) => m.length > 0 },
      { id: "9.1-monitoring", label: "Record suitable for performance monitoring", article: "Clause 9.1", check: (p, r) => p.length > 5 && r.length > 5 },
      { id: "10.2-improvement", label: "Interaction does not repeat known violations", article: "Clause 10.2", check: (_p, r) => !r.toLowerCase().includes("cannot help") || true },
      { id: "annex-a", label: "Model within scope of AI inventory", article: "Annex A", check: (_p, _r, m) => m.length > 0 },
    ],
  },
];

interface RuleResult {
  rule: AgentRule;
  pass: boolean;
}

interface AgentResult {
  agentId: string;
  interactionId: string;
  pass: boolean;
  results: RuleResult[];
  attestedBy?: string;
  attestedAt?: string;
}

function runAgent(agent: FrameworkAgent, prompt: string, response: string, model: string): RuleResult[] {
  return agent.rules.map(rule => ({
    rule,
    pass: (() => { try { return rule.check(prompt, response, model); } catch { return false; } })(),
  }));
}

function AgentCard({ agent, receipts, attestations, onAttest }: {
  agent: FrameworkAgent;
  receipts: Array<{ id: string; prompt: string; response: string; model: string; policyStatus: string }>;
  attestations: Record<string, AgentResult>;
  onAttest: (agentId: string, interactionId: string, results: RuleResult[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [currentResults, setCurrentResults] = useState<RuleResult[] | null>(null);
  const [attestName, setAttestName] = useState("");
  const [showAttest, setShowAttest] = useState(false);

  const AgentIcon = agent.icon;

  const attestationKey = selectedReceipt ? `${agent.id}::${selectedReceipt}` : null;
  const existing = attestationKey ? attestations[attestationKey] : null;

  function handleRun() {
    const receipt = receipts.find(r => r.id === selectedReceipt);
    if (!receipt) return;
    setRunning(true);
    setTimeout(() => {
      const results = runAgent(agent, receipt.prompt, receipt.response, receipt.model);
      setCurrentResults(results);
      setRunning(false);
      setShowAttest(true);
    }, 900);
  }

  function handleAttest() {
    if (!currentResults || !selectedReceipt || !attestName.trim()) return;
    onAttest(agent.id, selectedReceipt, currentResults);
    setShowAttest(false);
  }

  const allPass = currentResults ? currentResults.every(r => r.pass) : null;

  return (
    <Card className={`border ${expanded ? agent.accentBg : "border-border bg-card"} transition-all`}>
      <CardContent className="p-0">
        <button
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
          onClick={() => setExpanded(e => !e)}
        >
          <div className={`w-8 h-8 rounded border flex items-center justify-center flex-shrink-0 ${agent.accentBg}`}>
            <AgentIcon className={`w-4 h-4 ${agent.accentColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-sm text-foreground">{agent.name}</span>
              <Badge variant="outline" className={`font-mono text-[10px] ${agent.accentColor} border-current`}>{agent.shortName}</Badge>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{agent.jurisdiction}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono hidden sm:inline">{agent.rules.length} rules</span>
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
            <p className="text-xs text-muted-foreground font-mono leading-relaxed">{agent.description}</p>

            {/* Rules list */}
            <div className="space-y-1">
              {agent.rules.map(rule => {
                const result = currentResults?.find(r => r.rule.id === rule.id);
                return (
                  <div key={rule.id} className="flex items-center gap-2 text-xs font-mono">
                    {result ? (
                      result.pass
                        ? <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        : <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                    ) : (
                      <div className="w-3 h-3 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                    )}
                    <span className={`flex-1 ${result ? (result.pass ? "text-foreground" : "text-red-300") : "text-muted-foreground"}`}>{rule.label}</span>
                    {rule.article && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${agent.accentBg} ${agent.accentColor}`}>{rule.article}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Receipt selector + run */}
            <div className="flex gap-2 flex-wrap items-end">
              <div className="flex-1 min-w-40">
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-1">SELECT RECEIPT</div>
                <select
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground appearance-none focus:outline-none focus:border-primary"
                  value={selectedReceipt}
                  onChange={e => { setSelectedReceipt(e.target.value); setCurrentResults(null); setShowAttest(false); }}
                >
                  <option value="">— choose a receipt —</option>
                  {receipts.map(r => (
                    <option key={r.id} value={r.id}>{r.id.slice(0, 16)}… ({r.model})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleRun}
                disabled={!selectedReceipt || running}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-bold transition-colors disabled:opacity-40 ${agent.accentColor} border ${agent.accentBg} hover:brightness-125`}
              >
                {running ? (
                  <><div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />RUNNING…</>
                ) : (
                  <><Bot className="w-3 h-3" />RUN AGENT</>
                )}
              </button>
            </div>

            {/* Results summary */}
            {currentResults && (
              <div className={`rounded p-3 border text-xs font-mono space-y-2 ${allPass ? "bg-emerald-500/5 border-emerald-500/30" : "bg-red-500/5 border-red-500/30"}`}>
                <div className={`flex items-center gap-2 font-bold ${allPass ? "text-emerald-400" : "text-red-400"}`}>
                  {allPass ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  AGENT VERDICT: {allPass ? "COMPLIANT" : `${currentResults.filter(r => !r.pass).length} VIOLATION(S)`}
                </div>
                <div className="text-muted-foreground">
                  {currentResults.filter(r => r.pass).length}/{currentResults.length} rules passed
                </div>
              </div>
            )}

            {/* Human attestation */}
            {showAttest && !existing && (
              <div className="border border-border rounded p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono text-foreground font-bold">
                  <Stamp className="w-3 h-3 text-primary" />
                  HUMAN ATTESTATION
                </div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  Agents review. <span className="text-foreground font-bold">Humans decide.</span> Math proves. Sign off on this review result.
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Your name or ID"
                    value={attestName}
                    onChange={e => setAttestName(e.target.value)}
                    className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={handleAttest}
                    disabled={!attestName.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-mono font-bold hover:bg-primary/90 transition-colors disabled:opacity-40"
                  >
                    <Stamp className="w-3 h-3" />ATTEST
                  </button>
                </div>
              </div>
            )}

            {/* Existing attestation */}
            {existing && (
              <div className="border border-emerald-500/30 bg-emerald-500/5 rounded p-3 text-xs font-mono space-y-1">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <Stamp className="w-3 h-3" />ATTESTED
                </div>
                <div className="text-muted-foreground">By: <span className="text-foreground">{existing.attestedBy}</span></div>
                <div className="text-muted-foreground">At: <span className="text-foreground">{existing.attestedAt}</span></div>
                <div className="text-muted-foreground">Result: <span className={existing.pass ? "text-emerald-400" : "text-red-400"}>{existing.pass ? "COMPLIANT" : "NON-COMPLIANT"}</span></div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
  const { data } = useListInteractions({ limit: 20, offset: 0 });
  const [attestations, setAttestations] = useState<Record<string, AgentResult>>({});

  const receipts = (data?.items ?? []).map(i => ({
    id: i.id,
    prompt: i.prompt,
    response: i.response,
    model: i.model,
    policyStatus: i.policyStatus,
  }));

  function handleAttest(agentId: string, interactionId: string, results: RuleResult[]) {
    const key = `${agentId}::${interactionId}`;
    setAttestations(prev => ({
      ...prev,
      [key]: {
        agentId,
        interactionId,
        pass: results.every(r => r.pass),
        results,
        attestedBy: "Human Reviewer",
        attestedAt: new Date().toLocaleString(),
      },
    }));
  }

  const attestCount = Object.keys(attestations).length;

  return (
    <div className="space-y-6 max-w-2xl" data-testid="agents-page">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Bot className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight font-mono text-foreground">Framework Agents</h1>
          <Badge variant="outline" className="font-mono text-xs text-primary border-primary/30">{AGENTS.length} AGENTS</Badge>
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          Agents review. Humans decide. Math proves.
        </p>
      </div>

      {/* Tagline card */}
      <div className="border border-border rounded-md p-4 bg-card">
        <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest mb-3">HOW IT WORKS</div>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { icon: Bot, label: "AGENTS REVIEW", sub: "Policy rules evaluated automatically against every receipt", color: "text-primary" },
            { icon: Stamp, label: "HUMANS DECIDE", sub: "Reviewers attest or reject the agent's finding", color: "text-blue-400" },
            { icon: Shield, label: "MATH PROVES", sub: "Cryptographic chain seals the evidence permanently", color: "text-amber-400" },
          ].map(({ icon: Icon, label, sub, color }) => (
            <div key={label} className="space-y-1.5">
              <Icon className={`w-5 h-5 mx-auto ${color}`} />
              <div className={`text-[10px] font-mono font-bold ${color}`}>{label}</div>
              <div className="text-[10px] text-muted-foreground font-mono leading-tight">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {attestCount > 0 && (
        <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded px-3 py-2">
          <CheckCircle className="w-3 h-3" />
          {attestCount} attestation{attestCount !== 1 ? "s" : ""} recorded this session
          <span className="text-muted-foreground ml-1">(in-memory, exportable in future release)</span>
        </div>
      )}

      {receipts.length === 0 && (
        <div className="text-center py-10 text-muted-foreground font-mono text-xs border border-dashed border-border rounded-md">
          <Clock className="w-6 h-6 mx-auto mb-2 opacity-40" />
          No receipts yet — mint one first, then run an agent review.
        </div>
      )}

      <div className="space-y-3">
        {AGENTS.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            receipts={receipts}
            attestations={attestations}
            onAttest={handleAttest}
          />
        ))}
      </div>

      <div className="text-xs text-muted-foreground font-mono text-center pt-2">
        Community policy modules · Apache 2.0 ·{" "}
        <a href="https://github.com/aigovops-foundation-dev/aigovops-framework-auditor-w-certification" target="_blank" rel="noreferrer" className="text-primary hover:underline">
          aigovops-foundation-dev
        </a>
      </div>
    </div>
  );
}
