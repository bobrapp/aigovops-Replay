import { useGetAuditChainStatus } from "@workspace/api-client-react";
import { ShieldCheck, RefreshCw, CheckCircle, XCircle, Hash, Clock, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAuth } from "@/context/adminAuth";
import { AdminLoginModal } from "@/components/AdminLoginModal";

function ChainStatusBadge({ intact, tampered }: { intact: boolean; tampered: number }) {
  if (intact) {
    return (
      <span
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
        data-testid="audit-chain-status-intact"
      >
        <CheckCircle className="w-4 h-4" />
        Intact
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-50 text-red-700 border border-red-200"
      data-testid="audit-chain-status-tampered"
    >
      <XCircle className="w-4 h-4" />
      Tampered — {tampered} {tampered === 1 ? "entry" : "entries"} failed verification
    </span>
  );
}

export default function AuditPage() {
  const { isAuthenticated, isLoading: authLoading, recheckAuth } = useAdminAuth();

  const { data, isLoading, refetch, isFetching } = useGetAuditChainStatus();

  const handleRefresh = () => {
    void refetch();
  };

  return (
    <div className="space-y-6" data-testid="audit-page">
      {!authLoading && isAuthenticated === false && (
        <AdminLoginModal onSuccess={() => void recheckAuth()} />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "#1B3B6F" }}
          >
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Audit Log Integrity</h1>
            <p className="text-sm text-muted-foreground">
              Hash-chained tamper-evident audit trail
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="gap-2 font-semibold"
          onClick={() => void handleRefresh()}
          disabled={isFetching || !isAuthenticated}
          data-testid="button-audit-refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Verify Now
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Every audit event (receipt minted, verified, replayed) is chained with a SHA-256 hash
        linking each entry to its predecessor. Deleting, reordering, or altering any entry
        breaks the chain — detectable here on-demand.
      </p>

      {isAuthenticated && (
        <>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : data ? (
            <>
              {/* Status banner */}
              <Card className="border-border bg-card" data-testid="audit-chain-status-card">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5" />
                    Chain Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-4">
                  <ChainStatusBadge intact={data.intact} tampered={data.tampered} />

                  <div className="grid grid-cols-3 gap-4 pt-1">
                    <div>
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                        Total Entries
                      </div>
                      <div className="text-2xl font-bold text-foreground" data-testid="audit-total">
                        {data.total}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                        Chained Entries
                      </div>
                      <div
                        className="text-2xl font-bold text-foreground"
                        data-testid="audit-hashable"
                      >
                        {data.hashableEntries}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                        Failed Checks
                      </div>
                      <div
                        className={`text-2xl font-bold ${data.tampered > 0 ? "text-red-600" : "text-emerald-600"}`}
                        data-testid="audit-tampered"
                      >
                        {data.tampered}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Head hash */}
              {data.headHash && (
                <Card className="border-border bg-card">
                  <CardContent className="px-5 py-4">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">
                      Chain Head Hash
                    </div>
                    <div
                      className="font-mono text-xs text-primary break-all"
                      data-testid="audit-head-hash"
                    >
                      {data.headHash}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Last verified timestamp */}
              {data.verifiedAt && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  Last verified: {new Date(data.verifiedAt).toLocaleString()}
                </div>
              )}
            </>
          ) : null}
        </>
      )}

      {!isAuthenticated && !authLoading && (
        <div className="border-2 border-dashed border-border rounded-lg p-10 text-center space-y-2">
          <FileText className="w-8 h-8 text-muted-foreground/50 mx-auto" />
          <p className="text-sm text-muted-foreground font-medium">
            Admin authentication required to view the audit log chain status.
          </p>
        </div>
      )}
    </div>
  );
}
