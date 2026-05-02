import { useState } from "react";
import {
  Bot, ChevronDown, ChevronRight,
  Stamp, Shield, FileText, BarChart2, Globe, Clock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AgentRule {
  id: string;
  label: string;
  article?: string;
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
      { id: "art12-log", label: "Interaction produces auditable record", article: "Art. 12" },
      { id: "art12-model", label: "AI system identity declared", article: "Art. 12" },
      { id: "art13-no-impersonate", label: "No human impersonation in response", article: "Art. 13" },
      { id: "art9-length", label: "Prompt within operational bounds (≤8192 chars)", article: "Art. 9" },
      { id: "art26-injection", label: "No prompt injection detected", article: "Art. 26" },
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
      { id: "gov-1.1", label: "Interaction is attributable to a user", article: "GOVERN 1.1" },
      { id: "gov-1.2", label: "Model is from approved inventory", article: "GOVERN 1.2" },
      { id: "map-1.1", label: "Prompt does not contain PII patterns", article: "MAP 1.1" },
      { id: "measure-2.5", label: "Response length is non-trivial (>20 chars)", article: "MEASURE 2.5" },
      { id: "manage-2.2", label: "No explicit harm facilitation detected", article: "MANAGE 2.2" },
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
      { id: "cc6.1", label: "Interaction is timestamped and attributable", article: "CC6.1" },
      { id: "cc6.6", label: "Prompt does not contain credential-like strings", article: "CC6.6" },
      { id: "cc7.2", label: "Response does not echo back secrets", article: "CC7.2" },
      { id: "pi1.1", label: "Prompt and response both present", article: "PI1.1" },
      { id: "a1.2", label: "Model ID logged for availability audit trail", article: "A1.2" },
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
      { id: "6.1-risk", label: "No high-risk content patterns in prompt", article: "Clause 6.1" },
      { id: "8.4-transparency", label: "AI system identified (not opaque)", article: "Clause 8.4" },
      { id: "9.1-monitoring", label: "Record suitable for performance monitoring", article: "Clause 9.1" },
      { id: "10.2-improvement", label: "Interaction does not repeat known violations", article: "Clause 10.2" },
      { id: "annex-a", label: "Model within scope of AI inventory", article: "Annex A" },
    ],
  },
];

function AgentCard({ agent }: { agent: FrameworkAgent }) {
  const [expanded, setExpanded] = useState(false);
  const AgentIcon = agent.icon;

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
              {agent.rules.map(rule => (
                <div key={rule.id} className="flex items-center gap-2 text-xs font-mono">
                  <div className="w-3 h-3 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                  <span className="flex-1 text-muted-foreground">{rule.label}</span>
                  {rule.article && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${agent.accentBg} ${agent.accentColor}`}>{rule.article}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Coming soon stub */}
            <div className="flex items-center gap-2.5 rounded border border-dashed border-muted-foreground/25 bg-muted/10 px-3 py-2.5 text-xs font-mono text-muted-foreground">
              <Clock className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
              <span>Agent execution coming soon — rules defined, runtime integration in progress.</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
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

      <div className="space-y-3">
        {AGENTS.map(agent => (
          <AgentCard key={agent.id} agent={agent} />
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
