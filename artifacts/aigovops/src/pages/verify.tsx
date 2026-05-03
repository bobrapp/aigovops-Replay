import { useState } from "react";
import { useGetInteraction, useVerifyInteraction, getGetInteractionQueryKey } from "@workspace/api-client-react";
import { Search, CheckCircle, XCircle, Loader2, Shield, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

function VerifyStep({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className={`flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 ${ok ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
        {ok ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-red-600" />}
      </div>
      <span className={`text-sm font-medium ${ok ? "text-emerald-700" : "text-red-700"}`} data-testid={`verify-step-${label.toLowerCase().replace(/\s/g, "-")}`}>
        {label}
      </span>
      <span className={`ml-auto text-xs font-bold uppercase tracking-wide ${ok ? "text-emerald-600" : "text-red-600"}`}>
        {ok ? "Pass" : "Fail"}
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
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#1B3B6F" }}>
          <Search className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Verify Receipt</h1>
          <p className="text-sm text-muted-foreground">Cryptographic hash chain integrity check</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Input
          value={receiptId}
          onChange={(e) => setReceiptId(e.target.value)}
          placeholder="Enter receipt ID..."
          className="text-sm flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleVerify()}
          data-testid="input-receipt-id"
        />
        <Button onClick={handleVerify} disabled={checking || !receiptId.trim()} className="gap-2 font-semibold" data-testid="button-run-verify">
          {checking ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Checking…</> : <><Search className="w-3.5 h-3.5" />Verify</>}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 flex items-start gap-2.5">
        <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          The receipt ID is the unique identifier shown after minting — find it in{" "}
          <Link href="/history" className="text-primary underline underline-offset-2 hover:opacity-80">My Recordings</Link>
          {" "}or complete the{" "}
          <Link href="/tutorial" className="text-primary underline underline-offset-2 hover:opacity-80">step-by-step tutorial</Link>
          {" "}to mint one now.
        </p>
      </div>

      {interaction && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-3" data-testid="verify-interaction-info">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">Receipt Found</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Model</div>
              <div className="font-medium text-foreground">{interaction.model}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">User</div>
              <div className="font-medium text-foreground">{interaction.userId}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Date</div>
              <div className="font-medium text-foreground">{new Date(interaction.createdAt).toLocaleString()}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Policy</div>
              <div className={`font-bold uppercase text-sm ${interaction.policyStatus === "pass" ? "text-emerald-600" : interaction.policyStatus === "fail" ? "text-red-600" : "text-amber-600"}`}>
                {interaction.policyStatus}
              </div>
            </div>
          </div>
        </div>
      )}

      {verification && (
        <div className={`rounded-xl border-2 p-6 space-y-4 ${verification.valid ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`} data-testid="verify-result">
          <div className="flex items-center gap-4">
            {verification.valid
              ? <CheckCircle className="w-10 h-10 text-emerald-600 flex-shrink-0" />
              : <XCircle className="w-10 h-10 text-red-600 flex-shrink-0" />}
            <div>
              <div className={`text-lg font-bold ${verification.valid ? "text-emerald-800" : "text-red-800"}`} data-testid="verify-overall-result">
                {verification.valid ? "Chain Verified" : "Chain Invalid"}
              </div>
              <div className="text-sm text-muted-foreground">Checked at {new Date(verification.checkedAt).toLocaleString()}</div>
            </div>
          </div>
          <div className="border-t border-black/10 pt-3">
            <VerifyStep label="Prompt Hash" ok={verification.promptHashMatch} />
            <VerifyStep label="Response Hash" ok={verification.responseHashMatch} />
            <VerifyStep label="Chain Linkage" ok={verification.chainIntact} />
          </div>
          <div className="text-xs text-muted-foreground pt-1 font-mono" data-testid="verify-details">{verification.details}</div>
        </div>
      )}

      {!checking && lookupId && !interaction && (
        <div className="bg-card border-2 border-dashed border-border rounded-xl p-8 text-center" data-testid="verify-not-found">
          <Shield className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <div className="text-sm font-medium text-muted-foreground">Receipt not found. Check the ID and try again.</div>
        </div>
      )}
    </div>
  );
}
