import {
  useGetStats,
  useGetChain,
  useListInteractions,
} from "@workspace/api-client-react";
import {
  Shield,
  CheckCircle,
  Award,
  Download,
  Mail,
  Printer,
  Copy,
  Check,
  AlertTriangle,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useState } from "react";

const FRAMEWORKS = [
  {
    id: "eu-ai-act",
    shortName: "EU AI Act",
    full: "Regulation (EU) 2024/1689",
    jurisdiction: "European Union",
    color: "blue",
    checks: [
      "Auditable interaction records maintained (Art. 12)",
      "AI system identity declared per interaction (Art. 12)",
      "No human impersonation detected (Art. 13)",
      "Prompts within operational bounds (Art. 9)",
      "Prompt injection screening applied (Art. 26)",
    ],
  },
  {
    id: "nist-ai-rmf",
    shortName: "NIST AI RMF",
    full: "NIST AI 100-1",
    jurisdiction: "United States",
    color: "emerald",
    checks: [
      "Interactions attributable to user (GOVERN 1.1)",
      "Models from approved inventory (GOVERN 1.2)",
      "No PII patterns detected in prompts (MAP 1.1)",
      "Response length non-trivial (MEASURE 2.5)",
      "No harm facilitation detected (MANAGE 2.2)",
    ],
  },
  {
    id: "iso-42001",
    shortName: "ISO 42001",
    full: "ISO/IEC 42001:2023",
    jurisdiction: "International",
    color: "amber",
    checks: [
      "No high-risk content patterns in prompts (Clause 6.1)",
      "AI system identified, not opaque (Clause 8.4)",
      "Records suitable for performance monitoring (Clause 9.1)",
      "No repeat of known violations (Clause 10.2)",
      "Models within AI inventory scope (Annex A)",
    ],
  },
  {
    id: "soc2",
    shortName: "SOC 2 Type II",
    full: "AICPA Trust Services Criteria",
    jurisdiction: "AICPA",
    color: "purple",
    checks: [
      "Interactions timestamped and attributable (CC6.1)",
      "No credential-like strings in prompts (CC6.6)",
      "Responses do not echo secrets (CC7.2)",
      "Prompt and response both present per receipt (PI1.1)",
      "Model ID logged for availability audit trail (A1.2)",
    ],
  },
] as const;

type FrameworkColor = "blue" | "emerald" | "amber" | "purple";

const colorMap: Record<
  FrameworkColor,
  { bg: string; border: string; text: string; icon: string }
> = {
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    icon: "text-blue-500",
  },
  emerald: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    icon: "text-emerald-500",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    icon: "text-amber-500",
  },
  purple: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700",
    icon: "text-purple-500",
  },
};

function passRate(pass: number, total: number) {
  if (!total) return 0;
  return Math.round((pass / total) * 100);
}

function certNumber(headHash: string | null | undefined) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const hashPart = (headHash ?? "00000000").slice(0, 8).toUpperCase();
  return `AGOF-2.1-${dateStr}-${hashPart}`;
}

export default function CertificatePage() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: chain, isLoading: chainLoading } = useGetChain();
  const { data: interactions } = useListInteractions(
    { limit: 1, offset: 0 },
    { query: { queryKey: ["interactions", { limit: 1, offset: 0 }] } },
  );
  const [copiedId, setCopiedId] = useState(false);

  const certId = certNumber(chain?.headHash);
  const issueDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const isLoading = statsLoading || chainLoading;
  const total = stats?.totalInteractions ?? 0;
  const passCount = stats?.policyPassCount ?? 0;
  const rate = passRate(passCount, total);
  const chainOk = chain?.intact ?? false;
  const isCompliant = total > 0 && chainOk;
  const userId =
    interactions?.items?.[0]?.userId ?? "Authenticated Account";

  function copyId() {
    navigator.clipboard.writeText(certId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }

  function emailCertificate() {
    const subject = encodeURIComponent(
      `AIGovOps Foundation Auditor Certificate – ${certId}`,
    );
    const body = encodeURIComponent(
      `AIGovOps Foundation — Auditor Certificate v2.1\n` +
        `════════════════════════════════════════════════\n\n` +
        `Certificate No:  ${certId}\n` +
        `Issued:          ${issueDate}\n` +
        `Account:         ${userId}\n` +
        `Receipts:        ${total}\n` +
        `Pass Rate:       ${rate}%\n` +
        `Chain Integrity: ${chainOk ? "INTACT" : "COMPROMISED"}\n` +
        `Chain Head:      ${chain?.headHash ?? "N/A"}\n\n` +
        `Frameworks Certified:\n` +
        FRAMEWORKS.map((fw) => `  ✓ ${fw.shortName} — ${fw.full}`).join(
          "\n",
        ) +
        `\n\nVerify at: ${window.location.href}`,
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  }

  function downloadJson() {
    const data = {
      certificate: "AIGovOps Foundation Auditor Certificate",
      version: "2.1",
      certificateId: certId,
      issuedDate: new Date().toISOString(),
      accountId: userId,
      summary: {
        totalReceipts: total,
        policyPassCount: passCount,
        policyFailCount: stats?.policyFailCount ?? 0,
        passRate: `${rate}%`,
        chainIntact: chainOk,
        chainLength: chain?.length ?? 0,
        chainHeadHash: chain?.headHash ?? null,
        modelsUsed: stats?.modelsUsed ?? [],
      },
      frameworks: FRAMEWORKS.map((fw) => ({
        id: fw.id,
        name: fw.shortName,
        standard: fw.full,
        jurisdiction: fw.jurisdiction,
        checks: fw.checks,
        status: isCompliant
          ? "COMPLIANT"
          : total === 0
            ? "PENDING"
            : "REVIEW_REQUIRED",
      })),
      standard: "AIGovOps REPLAY v1.0",
      issuedBy: "AIGovOps Foundation",
      website: "https://www.aigovopsfoundation.org",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aigovops-certificate-${certId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <div className="text-muted-foreground text-sm">
            Generating certificate…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="max-w-3xl mx-auto space-y-5"
      data-testid="certificate-page"
    >
      {/* ── Action bar (hidden when printing) ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">
            Auditor Certificate
          </h1>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">
            v2.1
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 font-semibold"
            onClick={copyId}
            data-testid="cert-copy-id"
          >
            {copiedId ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copiedId ? "Copied!" : "Copy ID"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 font-semibold"
            onClick={emailCertificate}
            data-testid="cert-email"
          >
            <Mail className="w-3.5 h-3.5" />
            Email
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 font-semibold"
            onClick={downloadJson}
            data-testid="cert-download"
          >
            <Download className="w-3.5 h-3.5" />
            Download JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 font-semibold"
            onClick={() => window.print()}
            data-testid="cert-print"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </Button>
        </div>
      </div>

      {/* ── Certificate document ── */}
      <div
        className="rounded-2xl border-2 border-[#1B3B6F] bg-white overflow-hidden shadow-xl print:shadow-none print:border print:rounded-none"
        data-testid="certificate-document"
      >
        {/* Header */}
        <div
          className="relative text-white px-8 py-10 text-center"
          style={{
            background:
              "linear-gradient(135deg, #0F172A 0%, #1B3B6F 55%, #0d3320 100%)",
          }}
        >
          {/* Watermark */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none select-none">
            <Shield className="w-80 h-80" />
          </div>

          <div className="relative">
            {/* Seal */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <div
                className="w-14 h-14 rounded-full border-2 border-emerald-400/60 flex items-center justify-center"
                style={{ background: "rgba(16,185,129,0.15)" }}
              >
                <Shield className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="text-left">
                <div className="text-emerald-400 text-xs font-bold tracking-[0.22em] uppercase">
                  AIGovOps Foundation
                </div>
                <div className="text-white/50 text-[10px] tracking-widest font-mono">
                  AI Governance · Cryptographic Proof
                </div>
              </div>
            </div>

            <div className="text-[11px] text-white/45 tracking-[0.35em] uppercase font-mono mb-1">
              Officially Certifies
            </div>
            <h2 className="text-3xl font-bold tracking-tight mb-1">
              AUDITOR CERTIFICATE
            </h2>
            <div className="text-emerald-400 font-mono text-sm font-bold tracking-[0.25em] mb-6">
              VERSION 2.1
            </div>

            <div className="inline-block border border-white/20 rounded-xl px-6 py-3 bg-white/5">
              <div className="text-white/50 text-[10px] uppercase tracking-[0.2em] font-mono mb-1">
                Account Identifier
              </div>
              <div className="text-white font-mono text-sm font-semibold break-all">
                {userId}
              </div>
            </div>

            <p className="text-white/50 text-xs leading-relaxed mt-5 max-w-lg mx-auto">
              This certificate attests that the above account has maintained
              cryptographically-signed AI interaction records and applied
              international AI governance controls across all four frameworks
              listed below.
            </p>
          </div>
        </div>

        {/* Summary stat row */}
        <div
          className="grid grid-cols-3 border-b border-[#1B3B6F]/20"
          style={{
            background:
              "linear-gradient(90deg, rgba(27,59,111,0.04), rgba(16,185,129,0.04))",
          }}
        >
          {[
            {
              label: "Receipts Evaluated",
              value: total.toLocaleString(),
              ok: total > 0,
            },
            { label: "Policy Pass Rate", value: `${rate}%`, ok: rate >= 80 },
            {
              label: "Chain Integrity",
              value: chainOk ? "INTACT" : "BROKEN",
              ok: chainOk,
            },
          ].map(({ label, value, ok }) => (
            <div
              key={label}
              className="text-center px-4 py-5 border-r border-[#1B3B6F]/15 last:border-r-0"
            >
              <div
                className={`text-2xl font-bold font-mono ${ok ? "text-[#1B3B6F]" : "text-red-600"}`}
              >
                {value}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 font-medium">
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Framework compliance grid */}
        <div className="p-6">
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.22em] font-bold mb-5 text-center">
            Framework Compliance Matrix
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FRAMEWORKS.map((fw) => {
              const c = colorMap[fw.color as FrameworkColor];
              const status =
                total === 0
                  ? "PENDING"
                  : isCompliant
                    ? "COMPLIANT"
                    : "REVIEW REQUIRED";
              const statusStyle =
                status === "COMPLIANT"
                  ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                  : status === "PENDING"
                    ? "text-amber-700 bg-amber-50 border-amber-200"
                    : "text-red-700 bg-red-50 border-red-200";

              return (
                <div
                  key={fw.id}
                  className={`rounded-xl border ${c.border} ${c.bg} p-4`}
                  data-testid={`cert-framework-${fw.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className={`text-sm font-bold ${c.text}`}>
                        {fw.shortName}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {fw.full}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 font-mono">
                        {fw.jurisdiction}
                      </div>
                    </div>
                    <span
                      className={`text-[9px] font-bold px-2 py-1 rounded-full border uppercase tracking-wide flex-shrink-0 ${statusStyle}`}
                    >
                      {status}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {fw.checks.map((check, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <CheckCircle
                          className={`w-3 h-3 flex-shrink-0 mt-0.5 ${total > 0 ? c.icon : "text-muted-foreground/30"}`}
                        />
                        <span className="text-muted-foreground leading-tight">
                          {check}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Conditional warnings */}
          {total > 0 && !chainOk && (
            <div className="mt-4 flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                <span className="font-bold">Chain integrity issue detected.</span>{" "}
                One or more receipts may have been tampered with. Certificate
                validity is conditional pending chain repair.
              </p>
            </div>
          )}
          {total === 0 && (
            <div className="mt-4 flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700">
                <span className="font-bold">No receipts recorded yet.</span>{" "}
                <Link href="/record" className="underline hover:no-underline">
                  Record your first AI interaction
                </Link>{" "}
                to activate framework compliance tracking.
              </div>
            </div>
          )}

          {/* Model inventory */}
          {(stats?.modelsUsed?.length ?? 0) > 0 && (
            <div className="mt-4 border border-border rounded-lg p-3 bg-card">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-2">
                AI Models in Scope
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stats!.modelsUsed.map((m) => (
                  <span
                    key={m}
                    className="text-[11px] font-mono px-2 py-0.5 rounded border border-border bg-muted text-foreground"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="border-t border-[#1B3B6F]/20 px-6 py-5"
          style={{ background: "rgba(27,59,111,0.03)" }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-center sm:text-left mb-4">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-1">
                Certificate No.
              </div>
              <div className="text-xs font-mono font-bold text-[#1B3B6F] break-all">
                {certId}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-1">
                Chain Head Hash
              </div>
              <div className="text-xs font-mono text-muted-foreground break-all">
                {chain?.headHash ? `${chain.headHash.slice(0, 24)}…` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-1">
                Issued
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                {issueDate}
              </div>
              <div className="text-[9px] text-muted-foreground/50 font-mono mt-0.5">
                AIGovOps Foundation v2.1
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-[#1B3B6F]/10">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                isCompliant
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : total === 0
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {isCompliant ? (
                <CheckCircle className="w-3 h-3" />
              ) : (
                <AlertTriangle className="w-3 h-3" />
              )}
              {isCompliant
                ? "CERTIFICATE VALID"
                : total === 0
                  ? "PENDING — NO RECEIPTS"
                  : "CONDITIONAL — REVIEW REQUIRED"}
            </div>
            <a
              href="https://www.aigovopsfoundation.org"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-mono hover:text-primary transition-colors print:hidden"
            >
              <LinkIcon className="w-3 h-3" />
              aigovopsfoundation.org
            </a>
            <div className="ml-auto text-[10px] text-muted-foreground/50 font-mono">
              Cryptographic chain seal · AIGovOps REPLAY v1.0
            </div>
          </div>
        </div>
      </div>

      {/* Print-only footer */}
      <div className="hidden print:block text-center text-xs text-gray-400 font-mono pt-4">
        AIGovOps Foundation Auditor Certificate v2.1 · {certId} · {issueDate}
      </div>
    </div>
  );
}
