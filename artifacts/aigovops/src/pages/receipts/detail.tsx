import { useParams } from "wouter";
import { useGetInteraction, useVerifyInteraction, useReplayInteraction, getGetInteractionQueryKey, getGetStatsQueryKey, getGetChainQueryKey, getListInteractionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Shield, CheckCircle, XCircle, RefreshCw, Hash, ChevronLeft, Loader2, AlertTriangle, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ShareReceipt } from "@/components/ShareReceipt";

function HashRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wider w-32 flex-shrink-0 pt-0.5 font-semibold">{label}</span>
      <span className="text-sm text-foreground font-mono break-all" data-testid={`hash-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</span>
    </div>
  );
}

function PolicyBadge({ status }: { status: "pass" | "fail" | "pending" }) {
  const map = {
    pass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    fail: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold uppercase tracking-wide ${map[status]}`}>{status}</span>;
}

export default function ReceiptDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [verifying, setVerifying] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const { data: interaction, isLoading } = useGetInteraction(id!, {
    query: { enabled: !!id, queryKey: getGetInteractionQueryKey(id!) },
  });

  const { data: verification, refetch: runVerify } = useVerifyInteraction(id!, {
    query: { enabled: false, queryKey: getGetInteractionQueryKey(id!) },
  });

  const replay = useReplayInteraction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetChainQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListInteractionsQueryKey({}) });
        setReplaying(false);
      },
      onError: () => setReplaying(false),
    },
  });

  async function handleVerify() {
    setVerifying(true);
    await runVerify();
    setVerifying(false);
  }

  function handleReplay() {
    if (!id) return;
    setReplaying(true);
    replay.mutate({ id });
  }

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="receipt-detail-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!interaction) {
    return (
      <div className="text-center py-16" data-testid="receipt-not-found">
        <XCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <div className="text-muted-foreground font-medium">Receipt not found.</div>
        <Link href="/receipts"><Button variant="link" className="mt-2 text-primary font-semibold">Back to Receipts</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl" data-testid="receipt-detail-page">
      <div className="flex items-center gap-2">
        <Link href="/receipts">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground font-medium" data-testid="button-back-receipts">
            <ChevronLeft className="w-4 h-4" />Receipts
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#1B3B6F" }}>
              <Shield className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-base font-bold text-foreground font-mono" data-testid="receipt-id">{interaction.id.slice(0, 24)}…</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground ml-10 flex-wrap">
            <span className="font-semibold text-primary">{interaction.model}</span>
            <span>·</span>
            <span>{interaction.userId}</span>
            <span>·</span>
            <span>{new Date(interaction.createdAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PolicyBadge status={interaction.policyStatus} />
          {interaction.replayCount > 0 && (
            <span className="text-xs font-semibold text-sky-700 border border-sky-200 bg-sky-50 px-2.5 py-1 rounded-full" data-testid="replay-count">
              {interaction.replayCount}× Replayed
            </span>
          )}
        </div>
      </div>

      {interaction.tags && interaction.tags.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {interaction.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs text-muted-foreground border-border font-medium">{tag}</Badge>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2.5">Prompt</div>
          <div className="text-sm text-foreground whitespace-pre-wrap" data-testid="receipt-prompt">{interaction.prompt}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2.5">Response</div>
          <div className="text-sm text-foreground whitespace-pre-wrap" data-testid="receipt-response">{interaction.response}</div>
        </div>
      </div>

      {interaction.policyViolations && interaction.policyViolations.length > 0 && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-700 text-sm font-bold uppercase tracking-wider mb-2">
            <AlertTriangle className="w-4 h-4" />Policy Violations
          </div>
          {interaction.policyViolations.map((v, i) => (
            <div key={i} className="text-sm text-red-700 font-medium" data-testid={`policy-violation-${i}`}>{v}</div>
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">
          <Hash className="w-3.5 h-3.5" />Cryptographic Receipt
        </div>
        <HashRow label="Prompt Hash" value={interaction.promptHash} />
        <HashRow label="Response Hash" value={interaction.responseHash} />
        <HashRow label="Chain Hash" value={interaction.chainHash} />
        <HashRow label="Prev Hash" value={interaction.prevHash ?? "(genesis)"} />
      </div>

      {verification && (
        <div className={`rounded-xl border-2 p-5 space-y-4 ${verification.valid ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`} data-testid="verification-result">
          <div className={`flex items-center gap-2.5 text-sm font-bold ${verification.valid ? "text-emerald-700" : "text-red-700"}`}>
            {verification.valid ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            {verification.valid ? "Verification Passed" : "Verification Failed"}
          </div>
          <div className="space-y-2">
            {[
              { label: "Prompt Hash", ok: verification.promptHashMatch },
              { label: "Response Hash", ok: verification.responseHashMatch },
              { label: "Chain Intact", ok: verification.chainIntact },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-2.5 text-sm">
                {ok ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                <span className={`font-medium ${ok ? "text-emerald-700" : "text-red-700"}`}>{label}</span>
                <span className={`ml-auto text-xs font-bold uppercase tracking-wide ${ok ? "text-emerald-600" : "text-red-600"}`}>{ok ? "Pass" : "Fail"}</span>
              </div>
            ))}
            <div className="text-xs text-muted-foreground pt-1 font-mono" data-testid="verification-details">{verification.details}</div>
          </div>
        </div>
      )}

      {replay.data && (
        <div className="bg-card border border-border rounded-lg p-4" data-testid="replay-result">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground uppercase tracking-wider mb-3">
            <RefreshCw className="w-4 h-4 text-sky-600" />Replay Result
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Original</div>
              <div className="text-foreground whitespace-pre-wrap bg-muted border border-border rounded-lg p-3 text-xs" data-testid="replay-original">{replay.data.originalResponse}</div>
            </div>
            <div>
              <div className="text-xs text-sky-600 uppercase tracking-wide font-semibold mb-2">Replayed</div>
              <div className="text-foreground whitespace-pre-wrap bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs" data-testid="replay-new">{replay.data.replayedResponse}</div>
            </div>
          </div>
          {replay.data.outputDiff && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Diff</div>
              <pre className="text-xs font-mono bg-muted border border-border rounded-lg p-3 whitespace-pre-wrap text-amber-700" data-testid="replay-diff">{replay.data.outputDiff}</pre>
            </div>
          )}
          <div className={`mt-3 text-sm font-semibold ${replay.data.semanticMatch ? "text-emerald-600" : "text-amber-600"}`}>
            {replay.data.semanticMatch ? "Semantic Match: Yes" : "Semantic Match: No — outputs diverged"}
          </div>
        </div>
      )}

      <ShareReceipt interaction={interaction} />

      <div className="flex gap-3 flex-wrap">
        <Button variant="outline" onClick={handleVerify} disabled={verifying} className="gap-2 font-semibold" data-testid="button-verify-receipt">
          {verifying ? <><Loader2 className="w-4 h-4 animate-spin" />Verifying…</> : <><CheckCircle className="w-4 h-4" />Verify Chain</>}
        </Button>
        <Button onClick={handleReplay} disabled={replaying} className="gap-2 font-semibold bg-sky-600 hover:bg-sky-700 text-white" data-testid="button-replay-receipt">
          {replaying ? <><Loader2 className="w-4 h-4 animate-spin" />Replaying…</> : <><RefreshCw className="w-4 h-4" />Replay</>}
        </Button>
        <Link href="/certificate">
          <Button variant="outline" className="gap-2 font-semibold text-primary border-primary/30 hover:bg-primary/5" data-testid="button-view-certificate">
            <Award className="w-4 h-4" />View Certificate
          </Button>
        </Link>
      </div>
    </div>
  );
}
