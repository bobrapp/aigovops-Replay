import { useParams } from "wouter";
import { useGetInteraction, useVerifyInteraction, useReplayInteraction, getGetInteractionQueryKey, getGetStatsQueryKey, getGetChainQueryKey, getListInteractionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Shield, CheckCircle, XCircle, RefreshCw, Hash, ChevronLeft, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

function HashRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className="text-muted-foreground text-[10px] uppercase tracking-widest w-28 flex-shrink-0 pt-0.5 font-mono">{label}</span>
      <span className="text-foreground text-xs font-mono break-all" data-testid={`hash-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</span>
    </div>
  );
}

function PolicyBadge({ status }: { status: "pass" | "fail" | "pending" }) {
  const map = {
    pass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    fail: "bg-red-500/10 text-red-400 border-red-500/30",
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  };
  return <span className={`text-xs px-2 py-1 rounded border font-mono uppercase tracking-wide ${map[status]}`}>{status}</span>;
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
      <div className="text-center py-16 font-mono" data-testid="receipt-not-found">
        <XCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <div className="text-muted-foreground">Receipt not found.</div>
        <Link href="/receipts"><Button variant="link" className="mt-2 font-mono text-xs text-primary">Back to Receipts</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl" data-testid="receipt-detail-page">
      <div className="flex items-center gap-2">
        <Link href="/receipts">
          <Button variant="ghost" size="sm" className="font-mono text-xs gap-1 text-muted-foreground hover:text-foreground" data-testid="button-back-receipts">
            <ChevronLeft className="w-3 h-3" />RECEIPTS
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-primary" />
            <h1 className="text-lg font-bold font-mono text-foreground" data-testid="receipt-id">{interaction.id.slice(0, 24)}…</h1>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
            <span>{interaction.model}</span>
            <span>•</span>
            <span>{interaction.userId}</span>
            <span>•</span>
            <span>{new Date(interaction.createdAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PolicyBadge status={interaction.policyStatus} />
          {interaction.replayCount > 0 && (
            <span className="text-xs font-mono text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 rounded" data-testid="replay-count">
              {interaction.replayCount}x REPLAYED
            </span>
          )}
        </div>
      </div>

      {interaction.tags && interaction.tags.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {interaction.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="font-mono text-xs text-muted-foreground border-border">{tag}</Badge>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-md p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-widest font-mono mb-2">PROMPT</div>
          <div className="text-sm font-mono text-foreground whitespace-pre-wrap" data-testid="receipt-prompt">{interaction.prompt}</div>
        </div>
        <div className="bg-card border border-border rounded-md p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-widest font-mono mb-2">RESPONSE</div>
          <div className="text-sm font-mono text-foreground whitespace-pre-wrap" data-testid="receipt-response">{interaction.response}</div>
        </div>
      </div>

      {interaction.policyViolations && interaction.policyViolations.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-md p-4 space-y-1">
          <div className="flex items-center gap-2 text-red-400 text-xs font-mono uppercase tracking-widest mb-2">
            <AlertTriangle className="w-3 h-3" />POLICY VIOLATIONS
          </div>
          {interaction.policyViolations.map((v, i) => (
            <div key={i} className="text-xs font-mono text-red-300" data-testid={`policy-violation-${i}`}>{v}</div>
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-md p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest font-mono mb-3">
          <Hash className="w-3 h-3" />CRYPTOGRAPHIC RECEIPT
        </div>
        <HashRow label="PROMPT HASH" value={interaction.promptHash} />
        <HashRow label="RESPONSE HASH" value={interaction.responseHash} />
        <HashRow label="CHAIN HASH" value={interaction.chainHash} />
        <HashRow label="PREV HASH" value={interaction.prevHash ?? "(genesis)"} />
      </div>

      {verification && (
        <div className={`rounded-md p-4 border ${verification.valid ? "bg-emerald-500/5 border-emerald-500/30" : "bg-red-500/5 border-red-500/30"}`} data-testid="verification-result">
          <div className={`flex items-center gap-2 text-xs font-mono uppercase tracking-widest mb-3 ${verification.valid ? "text-emerald-400" : "text-red-400"}`}>
            {verification.valid ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {verification.valid ? "VERIFICATION PASSED" : "VERIFICATION FAILED"}
          </div>
          <div className="space-y-1.5 font-mono text-xs">
            {[
              { label: "Prompt Hash", ok: verification.promptHashMatch },
              { label: "Response Hash", ok: verification.responseHashMatch },
              { label: "Chain Intact", ok: verification.chainIntact },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-2">
                {ok ? <CheckCircle className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-red-400" />}
                <span className={ok ? "text-emerald-400" : "text-red-400"}>{label}: {ok ? "PASS" : "FAIL"}</span>
              </div>
            ))}
            <div className="text-muted-foreground pt-1" data-testid="verification-details">{verification.details}</div>
          </div>
        </div>
      )}

      {replay.data && (
        <div className="bg-card border border-border rounded-md p-4" data-testid="replay-result">
          <div className="text-xs text-muted-foreground uppercase tracking-widest font-mono mb-3 flex items-center gap-2">
            <RefreshCw className="w-3 h-3 text-cyan-400" />REPLAY RESULT
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <div className="text-muted-foreground mb-1">ORIGINAL</div>
              <div className="text-foreground whitespace-pre-wrap bg-background border border-border rounded p-2" data-testid="replay-original">{replay.data.originalResponse}</div>
            </div>
            <div>
              <div className="text-cyan-400 mb-1">REPLAYED</div>
              <div className="text-foreground whitespace-pre-wrap bg-background border border-border rounded p-2" data-testid="replay-new">{replay.data.replayedResponse}</div>
            </div>
          </div>
          {replay.data.outputDiff && (
            <div className="mt-3">
              <div className="text-muted-foreground text-[10px] uppercase mb-1 font-mono">DIFF</div>
              <pre className="text-xs font-mono bg-background border border-border rounded p-2 whitespace-pre-wrap text-yellow-300/80" data-testid="replay-diff">{replay.data.outputDiff}</pre>
            </div>
          )}
          <div className={`mt-2 text-xs font-mono ${replay.data.semanticMatch ? "text-emerald-400" : "text-yellow-400"}`}>
            {replay.data.semanticMatch ? "SEMANTIC MATCH: YES" : "SEMANTIC MATCH: NO (outputs diverged)"}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleVerify} disabled={verifying} className="font-mono text-xs gap-2" data-testid="button-verify-receipt">
          {verifying ? <><Loader2 className="w-3 h-3 animate-spin" />VERIFYING…</> : <><CheckCircle className="w-3 h-3" />VERIFY CHAIN</>}
        </Button>
        <Button onClick={handleReplay} disabled={replaying} className="font-mono text-xs gap-2 bg-cyan-600 hover:bg-cyan-700 text-white" data-testid="button-replay-receipt">
          {replaying ? <><Loader2 className="w-3 h-3 animate-spin" />REPLAYING…</> : <><RefreshCw className="w-3 h-3" />REPLAY</>}
        </Button>
      </div>
    </div>
  );
}
