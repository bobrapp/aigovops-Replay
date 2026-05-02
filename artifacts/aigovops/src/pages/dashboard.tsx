import { useGetStats, useGetChain, useListInteractions } from "@workspace/api-client-react";
import { Shield, CheckCircle, XCircle, RefreshCw, Link2, Activity, Clock, Zap, ArrowRight, Bot, Stamp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string;
  value: string | number | undefined;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <Card className="border-border bg-card relative overflow-hidden" data-testid={`stat-card-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className={`absolute top-0 left-0 w-0.5 h-full ${accent ?? "bg-primary"}`} />
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1.5 font-mono">
          <Icon className="w-3 h-3" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {value === undefined ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <div className="text-3xl font-bold font-mono text-foreground" data-testid={`stat-value-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</div>
        )}
        {sub && <div className="text-[10px] text-muted-foreground mt-1 font-mono">{sub}</div>}
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
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wide flex-shrink-0 ${map[status]}`} data-testid={`policy-badge-${status}`}>
      {status}
    </span>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: chain, isLoading: chainLoading } = useGetChain();
  const { data: recent } = useListInteractions({ limit: 5, offset: 0 });

  return (
    <div className="space-y-6" data-testid="dashboard-page">

      {/* Hero */}
      <div className="border-b border-border pb-5">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "linear-gradient(135deg, #1B3B6F 0%, #10b981 100%)" }}>
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight font-mono text-foreground">AIGovOps REPLAY</h1>
              <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono">LIVE</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Cryptographically signed receipts for every AI interaction · AiGovOps Foundation
            </p>
          </div>
        </div>

        {/* Chain status inline */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">CHAIN</span>
          {chainLoading ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <span className={`flex items-center gap-1 text-xs font-mono ${chain?.intact ? "text-emerald-400" : "text-red-400"}`} data-testid="chain-status">
              {chain?.intact ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {chain?.intact ? "INTACT" : "BROKEN"}
            </span>
          )}
          {chain?.headHash && (
            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-48" data-testid="chain-head-hash">
              HEAD {chain.headHash.slice(0, 20)}…
            </span>
          )}
          {chain && (
            <span className="text-[10px] text-primary font-mono" data-testid="chain-length">
              {chain.length} blocks
            </span>
          )}
        </div>
      </div>

      {/* CTA row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Link href="/demo">
          <div className="flex items-center justify-between bg-yellow-400/5 border border-yellow-400/20 rounded px-3 py-2.5 cursor-pointer hover:bg-yellow-400/10 hover:border-yellow-400/40 transition-colors group">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
              <div>
                <div className="text-xs font-bold font-mono text-yellow-400">LIVE DEMO</div>
                <div className="text-[10px] text-muted-foreground font-mono">4-step judge walkthrough</div>
              </div>
            </div>
            <ArrowRight className="w-3 h-3 text-yellow-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
        <Link href="/agents">
          <div className="flex items-center justify-between bg-blue-500/5 border border-blue-500/20 rounded px-3 py-2.5 cursor-pointer hover:bg-blue-500/10 hover:border-blue-500/40 transition-colors group">
            <div className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <div>
                <div className="text-xs font-bold font-mono text-blue-400">AGENTS</div>
                <div className="text-[10px] text-muted-foreground font-mono">EU AIA · NIST · SOC 2 · ISO</div>
              </div>
            </div>
            <ArrowRight className="w-3 h-3 text-blue-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
        <Link href="/spec">
          <div className="flex items-center justify-between bg-purple-500/5 border border-purple-500/20 rounded px-3 py-2.5 cursor-pointer hover:bg-purple-500/10 hover:border-purple-500/40 transition-colors group">
            <div className="flex items-center gap-2">
              <Stamp className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              <div>
                <div className="text-xs font-bold font-mono text-purple-400">OPEN SPEC</div>
                <div className="text-[10px] text-muted-foreground font-mono">Contribute policy modules</div>
              </div>
            </div>
            <ArrowRight className="w-3 h-3 text-purple-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard label="Total Receipts" value={statsLoading ? undefined : stats?.totalInteractions} icon={Activity} />
        <StatCard label="Verified" value={statsLoading ? undefined : stats?.verifiedCount} icon={CheckCircle} accent="bg-emerald-500" />
        <StatCard label="Policy Pass" value={statsLoading ? undefined : stats?.policyPassCount} icon={Shield} accent="bg-emerald-500" />
        <StatCard label="Policy Fail" value={statsLoading ? undefined : stats?.policyFailCount} icon={XCircle} accent="bg-red-500" />
        <StatCard label="Replays" value={statsLoading ? undefined : stats?.replayCount} icon={RefreshCw} accent="bg-cyan-500" />
      </div>

      {/* Recent receipts + activity */}
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-2 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />RECENT RECEIPTS
          </div>
          <div className="space-y-1.5" data-testid="recent-receipts-list">
            {recent?.items?.slice(0, 5).map((item) => (
              <Link href={`/receipts/${item.id}`} key={item.id}>
                <div className="bg-card border border-border rounded px-3 py-2.5 font-mono text-xs hover:border-primary/40 transition-colors cursor-pointer" data-testid={`receipt-row-${item.id}`}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-muted-foreground text-[10px] truncate">{item.id.slice(0, 14)}…</span>
                    <PolicyBadge status={item.policyStatus} />
                  </div>
                  <div className="text-foreground truncate">{item.prompt.slice(0, 72)}</div>
                  <div className="text-muted-foreground mt-1 flex gap-2 text-[10px]">
                    <span className="text-primary">{item.model}</span>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </Link>
            ))}
            {!recent?.items?.length && (
              <div className="text-muted-foreground text-xs font-mono p-4 border border-dashed border-border rounded text-center">
                No receipts yet.{" "}
                <Link href="/receipts/new"><span className="text-primary cursor-pointer hover:underline">Mint your first.</span></Link>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-2 flex items-center gap-1.5">
            <Link2 className="w-3 h-3" />ACTIVITY LOG
          </div>
          <div className="space-y-2" data-testid="activity-log">
            {stats?.recentActivity?.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-xs font-mono" data-testid={`activity-item-${a.id}`}>
                <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.type === "created" ? "bg-primary" : a.type === "replayed" ? "bg-cyan-400" : a.type === "verified" ? "bg-emerald-400" : "bg-yellow-400"}`} />
                <div>
                  <span className="text-foreground">{a.summary}</span>
                  <div className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {!stats?.recentActivity?.length && (
              <div className="text-muted-foreground text-xs font-mono p-4 border border-dashed border-border rounded text-center">No activity yet.</div>
            )}
          </div>

          {/* Models in use */}
          {stats?.modelsUsed && stats.modelsUsed.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-2">MODELS IN USE</div>
              <div className="flex flex-wrap gap-1.5" data-testid="models-list">
                {stats.modelsUsed.map((m) => (
                  <Badge key={m} variant="outline" className="font-mono text-[10px] text-primary border-primary/30" data-testid={`model-badge-${m}`}>{m}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Foundation tagline footer */}
      <div className="border-t border-border pt-4 flex items-center justify-between text-[10px] font-mono text-muted-foreground/50">
        <span>Agents review · Humans decide · Math proves</span>
        <a href="https://www.aigovopsfoundation.org" target="_blank" rel="noreferrer" className="hover:text-muted-foreground transition-colors">
          aigovopsfoundation.org ↗
        </a>
      </div>
    </div>
  );
}
