import { useGetStats, useGetChain, useListInteractions } from "@workspace/api-client-react";
import { Shield, CheckCircle, XCircle, RefreshCw, Link2, Activity, Clock, Zap, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

function StatCard({ label, value, sub, icon: Icon, accent }: { label: string; value: string | number | undefined; sub?: string; icon: React.ElementType; accent?: string }) {
  return (
    <Card className="border-border bg-card relative overflow-hidden" data-testid={`stat-card-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${accent ?? "bg-primary"}`} />
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-2">
          <Icon className="w-3 h-3" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {value === undefined ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-3xl font-bold font-mono text-foreground" data-testid={`stat-value-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</div>
        )}
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function PolicyBadge({ status }: { status: "pass" | "fail" | "pending" }) {
  const map = {
    pass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    fail: "bg-red-500/10 text-red-400 border-red-500/30",
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-mono uppercase tracking-wide ${map[status]}`} data-testid={`policy-badge-${status}`}>
      {status}
    </span>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: chain, isLoading: chainLoading } = useGetChain();
  const { data: recent } = useListInteractions({ limit: 5, offset: 0 });

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight font-mono text-foreground">AIGovOps REPLAY</h1>
          <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono">LIVE</span>
        </div>
        <p className="text-sm text-muted-foreground font-mono">Cryptographically signed receipts for every AI interaction</p>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground uppercase tracking-widest font-mono">CHAIN STATUS</span>
          {chainLoading ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <span className={`flex items-center gap-1 text-xs font-mono ${chain?.intact ? "text-emerald-400" : "text-red-400"}`} data-testid="chain-status">
              {chain?.intact ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {chain?.intact ? "CHAIN INTACT" : "CHAIN BROKEN"}
            </span>
          )}
        </div>
        {!chainLoading && chain && (
          <div className="bg-card border border-border rounded-md p-3 font-mono text-xs space-y-1">
            <div className="text-muted-foreground">HEAD <span className="text-foreground ml-2 truncate" data-testid="chain-head-hash">{chain.headHash?.slice(0, 40) ?? "—"}</span></div>
            <div className="text-muted-foreground">LENGTH <span className="text-primary ml-2" data-testid="chain-length">{chain.length}</span></div>
          </div>
        )}
      </div>

      <Link href="/demo">
        <div className="flex items-center justify-between bg-yellow-400/5 border border-yellow-400/20 rounded-md px-4 py-3 cursor-pointer hover:bg-yellow-400/10 hover:border-yellow-400/40 transition-colors group">
          <div className="flex items-center gap-3">
            <Zap className="w-4 h-4 text-yellow-400" />
            <div>
              <div className="text-sm font-bold font-mono text-yellow-400">LIVE DEMO — 4-step judge walkthrough</div>
              <div className="text-xs text-muted-foreground font-mono">Run a prompt → see a receipt → verify the hash → replay it</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-yellow-400 group-hover:translate-x-1 transition-transform" />
        </div>
      </Link>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard label="Total Receipts" value={statsLoading ? undefined : stats?.totalInteractions} icon={Activity} />
        <StatCard label="Verified" value={statsLoading ? undefined : stats?.verifiedCount} icon={CheckCircle} accent="bg-emerald-500" />
        <StatCard label="Policy Pass" value={statsLoading ? undefined : stats?.policyPassCount} icon={Shield} accent="bg-emerald-500" />
        <StatCard label="Policy Fail" value={statsLoading ? undefined : stats?.policyFailCount} icon={XCircle} accent="bg-red-500" />
        <StatCard label="Replays" value={statsLoading ? undefined : stats?.replayCount} icon={RefreshCw} accent="bg-cyan-500" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest font-mono mb-3 flex items-center gap-2">
            <Clock className="w-3 h-3" />RECENT RECEIPTS
          </div>
          <div className="space-y-2" data-testid="recent-receipts-list">
            {recent?.items?.slice(0, 5).map((item) => (
              <Link href={`/receipts/${item.id}`} key={item.id}>
                <div className="bg-card border border-border rounded-md p-3 font-mono text-xs hover:border-primary/40 transition-colors cursor-pointer" data-testid={`receipt-row-${item.id}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-muted-foreground">{item.id.slice(0, 16)}…</span>
                    <PolicyBadge status={item.policyStatus} />
                  </div>
                  <div className="text-foreground truncate">{item.prompt.slice(0, 80)}</div>
                  <div className="text-muted-foreground mt-1 flex gap-3">
                    <span>{item.model}</span>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </Link>
            ))}
            {!recent?.items?.length && (
              <div className="text-muted-foreground text-xs font-mono p-4 border border-dashed border-border rounded-md text-center">
                No receipts yet. <Link href="/receipts/new"><span className="text-primary cursor-pointer hover:underline">Mint your first receipt.</span></Link>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest font-mono mb-3 flex items-center gap-2">
            <Link2 className="w-3 h-3" />ACTIVITY LOG
          </div>
          <div className="space-y-2" data-testid="activity-log">
            {stats?.recentActivity?.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-xs font-mono" data-testid={`activity-item-${a.id}`}>
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.type === "created" ? "bg-primary" : a.type === "replayed" ? "bg-cyan-400" : a.type === "verified" ? "bg-emerald-400" : "bg-yellow-400"}`} />
                <div>
                  <span className="text-foreground">{a.summary}</span>
                  <div className="text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {(!stats?.recentActivity?.length) && (
              <div className="text-muted-foreground text-xs font-mono p-4 border border-dashed border-border rounded-md text-center">No activity yet.</div>
            )}
          </div>
        </div>
      </div>

      {stats?.modelsUsed && stats.modelsUsed.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest font-mono mb-2">MODELS IN USE</div>
          <div className="flex flex-wrap gap-2" data-testid="models-list">
            {stats.modelsUsed.map((m) => (
              <Badge key={m} variant="outline" className="font-mono text-xs text-primary border-primary/30" data-testid={`model-badge-${m}`}>{m}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
