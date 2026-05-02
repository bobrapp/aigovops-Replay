import { useState } from "react";
import { useGetInteraction, useVerifyInteraction, getGetInteractionQueryKey } from "@workspace/api-client-react";
import { CheckCircle, XCircle, Loader2, ShieldCheck, ShieldX, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          ok ? "bg-emerald-500/15" : "bg-red-500/15"
        }`}
      >
        {ok ? (
          <CheckCircle className="w-4 h-4 text-emerald-500" />
        ) : (
          <XCircle className="w-4 h-4 text-red-500" />
        )}
      </div>
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className={`text-xs mt-0.5 ${ok ? "text-emerald-500" : "text-red-500"}`}>
          {ok ? "Passed ✓" : "Failed — something changed"}
        </div>
      </div>
    </div>
  );
}

export default function SimpleCheck() {
  const [receiptId, setReceiptId] = useState("");
  const [lookupId, setLookupId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const { data: interaction } = useGetInteraction(lookupId!, {
    query: { enabled: !!lookupId, queryKey: getGetInteractionQueryKey(lookupId!) },
  });

  const { data: verification, refetch } = useVerifyInteraction(lookupId!, {
    query: { enabled: false, queryKey: ["simple-verify", lookupId] },
  });

  async function handleCheck() {
    if (!receiptId.trim()) return;
    setLookupId(receiptId.trim());
    setChecking(true);
    setTimeout(async () => {
      await refetch();
      setChecking(false);
    }, 100);
  }

  return (
    <div className="max-w-sm mx-auto space-y-6 pt-2" data-testid="simple-check-page">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <Search className="w-6 h-6 text-emerald-500" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Check a Recording</h1>
        <p className="text-sm text-muted-foreground">
          Confirm a saved chat hasn't been tampered with
        </p>
      </div>

      {/* Input */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground block mb-2">
            Recording ID
          </label>
          <Input
            value={receiptId}
            onChange={(e) => setReceiptId(e.target.value)}
            placeholder="Paste the recording ID here…"
            className="rounded-xl text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleCheck()}
            data-testid="simple-check-input"
          />
          <p className="text-xs text-muted-foreground mt-2">
            You can find the ID in "My Recordings" next to each saved chat.
          </p>
        </div>
        <Button
          className="w-full rounded-xl gap-2"
          onClick={handleCheck}
          disabled={checking || !receiptId.trim()}
          data-testid="simple-check-button"
        >
          {checking ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
          ) : (
            <>Check It <Search className="w-4 h-4" /></>
          )}
        </Button>
      </div>

      {/* Recording info */}
      {interaction && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Recording Found
          </div>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted-foreground">AI Tool</span>
            <span className="text-foreground font-medium">{interaction.model}</span>
            <span className="text-muted-foreground">Saved By</span>
            <span className="text-foreground font-medium">{interaction.userId}</span>
            <span className="text-muted-foreground">Date</span>
            <span className="text-foreground font-medium">
              {new Date(interaction.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      {/* Result */}
      {verification && (
        <div
          className={`rounded-2xl border-2 p-6 text-center space-y-4 ${
            verification.valid
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-red-500/40 bg-red-500/5"
          }`}
          data-testid="simple-check-result"
        >
          <div className="flex justify-center">
            {verification.valid ? (
              <ShieldCheck className="w-14 h-14 text-emerald-500" />
            ) : (
              <ShieldX className="w-14 h-14 text-red-500" />
            )}
          </div>
          <div>
            <div
              className={`text-xl font-bold ${
                verification.valid ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {verification.valid ? "All Good! ✓" : "Something Changed"}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {verification.valid
                ? "This recording is exactly as it was originally saved. Nothing has been altered."
                : "This recording doesn't match the original. It may have been modified."}
            </p>
          </div>

          <div className="bg-background/60 rounded-xl p-4 text-left">
            <CheckItem label="The question you asked" ok={verification.promptHashMatch} />
            <CheckItem label="The AI's reply" ok={verification.responseHashMatch} />
            <CheckItem label="Chain of custody" ok={verification.chainIntact} />
          </div>
        </div>
      )}

      {/* Not found */}
      {!checking && lookupId && !interaction && (
        <div className="text-center py-8 space-y-3" data-testid="simple-check-not-found">
          <div className="text-5xl">🔎</div>
          <div>
            <div className="font-semibold text-foreground">Recording not found</div>
            <div className="text-sm text-muted-foreground mt-1">
              Double-check the ID and try again.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
