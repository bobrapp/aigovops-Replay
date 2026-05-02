import { Shield, Copy, CheckCircle, ExternalLink, BookOpen, Code2, Package } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const RECEIPT_SCHEMA = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aigovops.dev/schemas/replay-receipt/v1.json",
  "title": "REPLAY Receipt",
  "description": "A cryptographically signed, hash-chained receipt for a single AI model interaction. Part of the AIGovOps REPLAY open specification.",
  "version": "1.0.0",
  "type": "object",
  "required": ["id", "promptHash", "responseHash", "chainHash", "model", "userId", "policyStatus", "createdAt"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique 32-byte hex receipt identifier",
      "pattern": "^[0-9a-f]{32}$"
    },
    "prompt": {
      "type": "string",
      "description": "The original prompt text sent to the model"
    },
    "response": {
      "type": "string",
      "description": "The model response text"
    },
    "promptHash": {
      "type": "string",
      "description": "SHA-256 of 'prompt:' + prompt text (hex)",
      "pattern": "^[0-9a-f]{64}$"
    },
    "responseHash": {
      "type": "string",
      "description": "SHA-256 of 'response:' + response text (hex)",
      "pattern": "^[0-9a-f]{64}$"
    },
    "chainHash": {
      "type": "string",
      "description": "SHA-256 of 'chain:' + promptHash + ':' + responseHash + ':' + prevHash (hex). GENESIS if first entry.",
      "pattern": "^[0-9a-f]{64}$"
    },
    "prevHash": {
      "type": ["string", "null"],
      "description": "chainHash of the immediately preceding receipt, or null for the genesis entry",
      "pattern": "^[0-9a-f]{64}$"
    },
    "model": {
      "type": "string",
      "description": "Model identifier (e.g. gpt-4o, claude-3-5-sonnet)"
    },
    "userId": {
      "type": "string",
      "description": "Identifier of the user or system that initiated the interaction"
    },
    "policyStatus": {
      "type": "string",
      "enum": ["pass", "fail", "pending"],
      "description": "Result of policy-as-code evaluation"
    },
    "policyViolations": {
      "type": "array",
      "description": "Names of policies that failed evaluation",
      "items": { "type": "string" }
    },
    "replayCount": {
      "type": "integer",
      "minimum": 0,
      "description": "Number of times this receipt has been replayed"
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Freeform tags for categorization"
    },
    "metadata": {
      "type": "object",
      "description": "Arbitrary key-value metadata"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of receipt creation"
    }
  }
};

const CHAIN_ALGORITHM = `// REPLAY Hash-Chain Algorithm (v1)
// Each receipt seals itself into the chain:

function computeHashes(prompt, response, prevChainHash) {
  const promptHash  = sha256("prompt:"   + prompt);
  const responseHash = sha256("response:" + response);
  const seed = prevChainHash ?? "GENESIS";
  const chainHash   = sha256("chain:"    + promptHash
                             + ":"       + responseHash
                             + ":"       + seed);
  return { promptHash, responseHash, chainHash };
}

// Verify any receipt independently:
function verify(receipt) {
  const { promptHash, responseHash, chainHash } =
    computeHashes(receipt.prompt, receipt.response, receipt.prevHash);
  return promptHash  === receipt.promptHash
      && responseHash === receipt.responseHash
      && chainHash    === receipt.chainHash;
}`;

const EU_AI_ACT_MODULE = `// Policy Module: EU AI Act — Art. 12 Record-Keeping (High-Risk Systems)
// REPLAY Policy-as-Code Module v1.0
// Maintainer: community
// Reference: EU AI Act 2024/1689, Article 12

module.exports = [
  {
    name: "EU-AIA/Art12: Interaction Logged",
    description: "Every high-risk AI interaction must produce an auditable log entry",
    severity: "critical",
    rule: "typeof prompt === 'string' && prompt.length > 0 && typeof response === 'string'"
  },
  {
    name: "EU-AIA/Art12: Model Identity Declared",
    description: "The AI system identifier must be recorded with each interaction",
    severity: "high",
    rule: "typeof model === 'string' && model.length > 0"
  },
  {
    name: "EU-AIA/Art12: User Identity Bound",
    description: "Each interaction must be attributable to a natural or legal person",
    severity: "high",
    rule: "typeof userId === 'string' && userId.length > 0"
  },
  {
    name: "EU-AIA/Art13: Transparency — No Silent Impersonation",
    description: "Response must not claim to be a human when directly asked",
    severity: "critical",
    rule: "!response.toLowerCase().includes('i am a human') && !response.toLowerCase().includes('i\\'m not an ai')"
  },
  {
    name: "EU-AIA/Art9: Prompt Length Guard",
    description: "Anomalously long prompts may indicate data exfiltration attempts",
    severity: "medium",
    rule: "prompt.length <= 8192"
  }
];`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function SpecPage() {
  const schemaText = JSON.stringify(RECEIPT_SCHEMA, null, 2);

  return (
    <div className="space-y-8 pb-10" data-testid="spec-page">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <BookOpen className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight font-mono text-foreground">REPLAY Receipt Open Spec</h1>
          <Badge variant="outline" className="font-mono text-xs text-emerald-400 border-emerald-500/30">v1.0.0</Badge>
        </div>
        <p className="text-sm text-muted-foreground font-mono max-w-2xl">
          The REPLAY Receipt JSON Schema is an open specification for cryptographically verifiable AI interaction records.
          Publish it under your governance foundation — invite policy modules rather than policy PDFs.
        </p>
      </div>

      {/* Mission framing */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <p className="text-sm font-mono text-foreground leading-relaxed">
            <span className="text-primary font-bold">Why this exists:</span>{" "}
            AI governance today is a stack of PDFs. REPLAY turns it into executable evidence —
            every interaction gets a receipt, every receipt gets chained, every chain is independently verifiable.
            The schema is open so anyone can build a compliant logger. The policy modules are open
            so contributors write <em>rules</em>, not essays.
          </p>
        </CardContent>
      </Card>

      {/* Hash algorithm */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-mono">HASH-CHAIN ALGORITHM</span>
          </div>
          <CopyButton text={CHAIN_ALGORITHM} />
        </div>
        <pre className="bg-card border border-border rounded-md p-4 text-xs font-mono text-foreground overflow-x-auto leading-relaxed whitespace-pre">{CHAIN_ALGORITHM}</pre>
      </div>

      {/* JSON Schema */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-mono">RECEIPT JSON SCHEMA</span>
            <span className="text-xs text-muted-foreground font-mono">— JSON Schema 2020-12</span>
          </div>
          <CopyButton text={schemaText} />
        </div>
        <pre className="bg-card border border-border rounded-md p-4 text-xs font-mono text-foreground overflow-x-auto max-h-96 leading-relaxed">{schemaText}</pre>
      </div>

      {/* EU AI Act policy module */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-mono">COMMUNITY POLICY MODULE</span>
            <Badge variant="outline" className="font-mono text-xs text-cyan-400 border-cyan-500/30">EU AI Act 2024/1689</Badge>
          </div>
          <CopyButton text={EU_AI_ACT_MODULE} />
        </div>
        <p className="text-xs text-muted-foreground font-mono mb-3">
          Drop-in policy module aligning with EU AI Act Art. 12 (Record-Keeping) and Art. 13 (Transparency) for high-risk AI systems.
          Each rule is a JS expression evaluated against <code className="text-primary">&#123; prompt, response, model, userId &#125;</code>.
        </p>
        <pre className="bg-card border border-border rounded-md p-4 text-xs font-mono text-foreground overflow-x-auto max-h-80 leading-relaxed">{EU_AI_ACT_MODULE}</pre>
      </div>

      {/* Contribute */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-primary" />
            CONTRIBUTE A POLICY MODULE
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs font-mono text-muted-foreground">
          <p>Policy modules are plain JS arrays of rule objects. Each rule needs:</p>
          <div className="bg-background border border-border rounded p-3 space-y-1 text-foreground">
            <div><span className="text-primary">name</span>        — unique identifier (e.g. "NIST-AI-RMF/Govern-1.1")</div>
            <div><span className="text-primary">description</span>  — human-readable explanation</div>
            <div><span className="text-primary">severity</span>     — "critical" | "high" | "medium" | "low"</div>
            <div><span className="text-primary">rule</span>         — JS expression returning boolean; ctx: &#123; prompt, response, model, userId &#125;</div>
          </div>
          <p className="text-muted-foreground">
            Early targets: <span className="text-foreground">NIST AI RMF Govern</span> · <span className="text-foreground">ISO 42001</span> · <span className="text-foreground">HIPAA AI Addendum</span> · <span className="text-foreground">SOC 2 AI logging</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
