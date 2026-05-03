import { useState } from "react";
import { Copy, Mail, Download, Printer, Check, Share2 } from "lucide-react";
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
  const [copied, setCopied] = useState<"link" | "json" | null>(null);

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
      <div className="flex items-center gap-2 flex-wrap">
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
    </div>
  );
}
