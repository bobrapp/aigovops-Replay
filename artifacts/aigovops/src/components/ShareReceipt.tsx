import { useState } from "react";
import { Copy, Mail, Download, Printer, Check, Share2, Link as LinkIcon, Loader2, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareReceiptProps {
  interaction: {
    id: string;
    model: string;
    prompt: string;
    response: string;
    chainHash?: string | null;
    promptHash?: string | null;
    responseHash?: string | null;
    policyStatus: "pass" | "fail" | "pending" | "error";
    createdAt: string;
    userId: string;
  };
}

export function ShareReceipt({ interaction }: ShareReceiptProps) {
  const [copied, setCopied] = useState<"link" | "json" | "verify" | null>(null);
  const [verifyLinkLoading, setVerifyLinkLoading] = useState(false);
  const [verifyLinkError, setVerifyLinkError] = useState<string | null>(null);
  /**
   * redactContent: issuer-controlled redaction flag.
   * When true, POST /share-token is called with { redact: true }, which the server
   * stores on the token row. GET /verify/:id then omits prompt/response regardless
   * of what the recipient passes in the URL — the recipient cannot bypass this.
   */
  const [redactContent, setRedactContent] = useState(false);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const receiptUrl = `${window.location.origin}${base}/receipts/${interaction.id}`;

  const receiptJson = JSON.stringify(
    {
      receiptId: interaction.id,
      model: interaction.model,
      prompt: interaction.prompt,
      response: interaction.response,
      promptHash: interaction.promptHash ?? null,
      responseHash: interaction.responseHash ?? null,
      chainHash: interaction.chainHash ?? null,
      policyStatus: interaction.policyStatus,
      createdAt: interaction.createdAt,
      userId: interaction.userId,
      issuedBy: "AIGovOps Foundation",
      standard: "AIGovOps REPLAY v1.0",
    },
    null,
    2,
  );

  async function copyLink() {
    await navigator.clipboard.writeText(receiptUrl);
    setCopied("link");
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyJson() {
    await navigator.clipboard.writeText(receiptJson);
    setCopied("json");
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyVerifyLink() {
    setVerifyLinkLoading(true);
    setVerifyLinkError(null);
    try {
      const res = await fetch(`${base}/api/interactions/${interaction.id}/share-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redact: redactContent }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = (await res.json()) as { token: string; verifyUrl: string; expiresAt: string };
      await navigator.clipboard.writeText(data.verifyUrl);
      setCopied("verify");
      setTimeout(() => setCopied(null), 3000);
    } catch (err) {
      setVerifyLinkError(err instanceof Error ? err.message : "Failed to generate link");
    } finally {
      setVerifyLinkLoading(false);
    }
  }

  function emailReceipt() {
    const subject = encodeURIComponent(
      `AIGovOps Receipt – ${interaction.model} – ${new Date(interaction.createdAt).toLocaleDateString()}`,
    );
    const body = encodeURIComponent(
      `AIGovOps Foundation — Cryptographic Receipt\n` +
        `═══════════════════════════════════════════\n\n` +
        `Receipt ID:    ${interaction.id}\n` +
        `Model:         ${interaction.model}\n` +
        `Created:       ${new Date(interaction.createdAt).toLocaleString()}\n` +
        `Policy Status: ${interaction.policyStatus.toUpperCase()}\n\n` +
        `── PROMPT ──\n${interaction.prompt}\n\n` +
        `── RESPONSE ──\n${interaction.response}\n\n` +
        `── HASHES ──\n` +
        `Prompt Hash:   ${interaction.promptHash ?? "N/A"}\n` +
        `Response Hash: ${interaction.responseHash ?? "N/A"}\n` +
        `Chain Hash:    ${interaction.chainHash ?? "N/A"}\n\n` +
        `Verify at: ${receiptUrl}`,
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  }

  function downloadJson() {
    const blob = new Blob([receiptJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aigovops-receipt-${interaction.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
        <Share2 className="w-3.5 h-3.5" />
        Share This Receipt
      </div>

      {/* Issuer-controlled redaction toggle — must be set BEFORE generating the link */}
      <label
        className="flex items-center gap-2 mb-3 cursor-pointer select-none w-fit"
        data-testid="share-redact-toggle"
      >
        <div
          className={`relative w-8 h-4 rounded-full transition-colors ${redactContent ? "bg-amber-500" : "bg-muted"}`}
          onClick={() => setRedactContent((v) => !v)}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${redactContent ? "translate-x-4" : ""}`}
          />
        </div>
        <EyeOff className={`w-3.5 h-3.5 ${redactContent ? "text-amber-500" : "text-muted-foreground"}`} />
        <span className={`text-xs font-medium ${redactContent ? "text-amber-600" : "text-muted-foreground"}`}>
          {redactContent ? "Prompt & response hidden from recipient" : "Include prompt & response in shared view"}
        </span>
      </label>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Share public verification link — calls POST /share-token, copies URL */}
        <Button
          variant="outline"
          size="sm"
          className="gap-2 font-semibold"
          onClick={copyVerifyLink}
          disabled={verifyLinkLoading}
          data-testid="share-verify-link"
        >
          {verifyLinkLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : copied === "verify" ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <LinkIcon className="w-3.5 h-3.5" />
          )}
          {copied === "verify" ? "Copied!" : "Share Verification Link"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-2 font-semibold"
          onClick={copyLink}
          data-testid="share-copy-link"
        >
          {copied === "link" ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied === "link" ? "Copied!" : "Copy Link"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 font-semibold"
          onClick={copyJson}
          data-testid="share-export-json"
        >
          {copied === "json" ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Share2 className="w-3.5 h-3.5" />
          )}
          {copied === "json" ? "Copied!" : "Export JSON"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 font-semibold"
          onClick={emailReceipt}
          data-testid="share-email"
        >
          <Mail className="w-3.5 h-3.5" />
          Email
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 font-semibold"
          onClick={downloadJson}
          data-testid="share-download"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 font-semibold print:hidden"
          onClick={() => window.print()}
          data-testid="share-print"
        >
          <Printer className="w-3.5 h-3.5" />
          Print / PDF
        </Button>
      </div>
      {verifyLinkError && (
        <div className="mt-2 text-xs text-red-600 font-medium" data-testid="share-verify-error">{verifyLinkError}</div>
      )}
    </div>
  );
}
