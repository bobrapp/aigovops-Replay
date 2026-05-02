import { useState } from "react";
import { useGetInteraction, useVerifyInteraction, getGetInteractionQueryKey } from "@workspace/api-client-react";
import { Search, CheckCircle, XCircle, Loader2, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function VerifyStep({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
      <div className={`flex items-center justify-center w-6 h-6 rounded-full ${ok ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-red-500/10 border border-red-500/30"}`}>
        {ok ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
      </div>
      <span className={`text-xs font-mono ${ok ? "text-emerald-400" : "text-red-400"}`} data-testid={`verify-step-${label.toLowerCase().replace(/\s/g, "-")}`}>
        {label}: {ok ? "PASS" : "FAIL"}
      </span>
    </div>
  );
}

export default function VerifyReceipt() {
  const [receiptId, setReceiptId] = useState("");
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const { data: interaction } = useGetInteraction(lookupId!, {
    query: { enabled: !!lookupId, queryKey: getGetInteractionQueryKey(lookupId!) },
  });

  const { data: verification, refetch } = useVerifyInteraction(lookupId!, {
    query: { enabled: false, queryKey: ["verify-manual", lookupId] },
  });

  async function handleVerify() {
    if (!receiptId.trim()) return;
    setLookupId(receiptId.trim());
    setChecking(true);
    setTimeout(async () => {
      await refetch();
      setChecking(false);
    }, 100);
  }

  return (
    <div className="max-w-xl mx-auto space-y-6" data-testid="verify-page">
      <div className="flex items-center gap-2 mb-2">
        <Search className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold font-mono text-foreground">Verify Receipt</h1>
      </div>
      <p className="text-sm text-muted-foreground font-mono">Enter a receipt ID to verify its cryptographic hash chain integrity.</p>

      <div className="flex gap-3">
        <Input
          value={receiptId}
          onChange={(e) => setReceiptId(e.target.value)}
          placeholder="Enter receipt ID..."
          className="font-mono text-sm flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleVerify()}
          data-testid="input-receipt-id"
        />
        <Button onClick={handleVerify} disabled={checking || !receiptId.trim()} className="font-mono text-xs gap-2" data-testid="button-run-verify">
          {checking ? <><Loader2 className="w-3 h-3 animate-spin" />CHECKING…</> : <><Search className="w-3 h-3" />VERIFY</>}
        </Button>
      </div>

      {interaction && (
        <div className="bg-card border border-border rounded-md p-4 font-mono text-xs space-y-2" data-testid="verify-interaction-info">
          <div className="text-muted-foreground uppercase tracking-widest text-[10px] mb-2">RECEIPT FOUND</div>
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">MODEL </span><span className="text-foreground">{interaction.model}</span></div>
            <div><span className="text-muted-foreground">USER </span><span className="text-foreground">{interaction.userId}</span></div>
            <div><span className="text-muted-foreground">DATE </span><span className="text-foreground">{new Date(interaction.createdAt).toLocaleString()}</span></div>
            <div><span className="text-muted-foreground">POLICY </span>
              <span className={interaction.policyStatus === "pass" ? "text-emerald-400" : interaction.policyStatus === "fail" ? "text-red-400" : "text-yellow-400"}>
                {interaction.policyStatus.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      )}

      {verification && (
        <div className={`rounded-md border p-5 space-y-3 ${verification.valid ? "bg-emerald-500/5 border-emerald-500/30" : "bg-red-500/5 border-red-500/30"}`} data-testid="verify-result">
          <div className="flex items-center gap-3">
            {verification.valid
              ? <CheckCircle className="w-8 h-8 text-emerald-400" />
              : <XCircle className="w-8 h-8 text-red-400" />}
            <div>
              <div className={`text-sm font-bold font-mono ${verification.valid ? "text-emerald-400" : "text-red-400"}`} data-testid="verify-overall-result">
                {verification.valid ? "CHAIN VERIFIED" : "CHAIN INVALID"}
              </div>
              <div className="text-xs text-muted-foreground font-mono">Checked at {new Date(verification.checkedAt).toLocaleString()}</div>
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <VerifyStep label="Prompt Hash" ok={verification.promptHashMatch} />
            <VerifyStep label="Response Hash" ok={verification.responseHashMatch} />
            <VerifyStep label="Chain Linkage" ok={verification.chainIntact} />
          </div>
          <div className="text-xs font-mono text-muted-foreground pt-1" data-testid="verify-details">{verification.details}</div>
        </div>
      )}

      {!checking && lookupId && !interaction && (
        <div className="bg-card border border-border rounded-md p-6 text-center font-mono text-xs text-muted-foreground" data-testid="verify-not-found">
          <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          Receipt not found. Check the ID and try again.
        </div>
      )}
    </div>
  );
}
