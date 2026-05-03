import { useGetStats, useGetChain, useListInteractions } from "@workspace/api-client-react";
import { Shield, CheckCircle, XCircle, RefreshCw, Link2, Activity, Clock, Zap, ArrowRight, Bot, Stamp, BookOpen } from "lucide-react";
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
      <div className={`absolute top-0 left-0 w-1 h-full ${accent ?? "bg-primary"}`} />
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[11px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 font-semibold">
          <Icon className="w-3 h-3" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {value === undefined ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <div className="text-3xl font-bold text-foreground" data-testid={`stat-value-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</div>
        )}
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function PolicyBadge({ status }: { status: "pass" | "fail" | "pending" }) {
  const map = {
    pass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    fail: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide flex-shrink-0 ${map[status]}`} data-testid={`policy-badge-${status}`}>
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

      {/* Foundation hero header */}
      <div className="rounded-xl overflow-hidden">
        <div className="px-6 py-5" style={{ background: "#1B3B6F" }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-white/15">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight tracking-tight">AIGovOps REPLAY - BLACKBOX</h1>
              <p className="text-white/60 text-xs mt-0.5">From Intentions to Evidence · AiGovOps Foundation</p>
            </div>
            <div className="ml-auto">
              <span className="text-[10px] bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide">● Live</span>
            </div>
          </div>

          {/* Chain status bar */}
          <div className="flex items-center gap-4 pt-3 border-t border-white/10">
            <span className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Chain</span>
            {chainLoading ? (
              <Skeleton className="h-4 w-24 bg-white/10" />
            ) : (
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${chain?.intact ? "text-emerald-400" : "text-red-400"}`} data-testid="chain-status">
                {chain?.intact ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {chain?.intact ? "Intact" : "Broken"}
              </span>
            )}
            {chain?.headHash && (
              <span className="text-[10px] text-white/40 font-mono truncate max-w-48" data-testid="chain-head-hash">
                HEAD {chain.headHash.slice(0, 20)}…
              </span>
            )}
            {chain && (
              <span className="text-xs font-semibold text-white/60" data-testid="chain-length">
                {chain.length} blocks
              </span>
            )}
          </div>
        </div>
      </div>

      {/* CTA row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/tutorial">
          <div className="flex items-center justify-between border-2 border-primary/40 rounded-xl px-4 py-3 cursor-pointer hover:border-primary/70 transition-all group" style={{ background: "linear-gradient(135deg,#1B3B6F08,#10B98108)" }} data-testid="dashboard-tutorial-cta">
            <div className="flex items-center gap-3">
              <BookOpen className="w-4 h-4 text-primary flex-shrink-0" />
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-bold text-foreground">Tutorial</div>
                  <span className="text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full uppercase tracking-wide">Start here</span>
                </div>
                <div className="text-[11px] text-muted-foreground">Paste → mint → verify → replay</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-primary group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
        <Link href="/demo">
          <div className="flex items-center justify-between border-2 border-amber-200 bg-amber-50 rounded-xl px-4 py-3 cursor-pointer hover:border-amber-400 hover:bg-amber-100 transition-all group">
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <div>
                <div className="text-sm font-bold text-amber-800">Live Demo</div>
                <div className="text-[11px] text-amber-700/70">Judge walkthrough — 4 steps</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-amber-600 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
        <Link href="/agents">
          <div className="flex items-center justify-between border-2 border-blue-200 bg-blue-50 rounded-xl px-4 py-3 cursor-pointer hover:border-blue-400 hover:bg-blue-100 transition-all group">
            <div className="flex items-center gap-3">
              <Bot className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <div>
                <div className="text-sm font-bold text-blue-800">Policy Agents</div>
                <div className="text-[11px] text-blue-700/70">EU AIA · NIST · SOC 2 · ISO</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-blue-600 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
        <Link href="/spec">
          <div className="flex items-center justify-between border-2 border-purple-200 bg-purple-50 rounded-xl px-4 py-3 cursor-pointer hover:border-purple-400 hover:bg-purple-100 transition-all group">
            <div className="flex items-center gap-3">
              <Stamp className="w-4 h-4 text-purple-600 flex-shrink-0" />
              <div>
                <div className="text-sm font-bold text-purple-800">Open Spec</div>
                <div className="text-[11px] text-purple-700/70">Contribute policy modules</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-purple-600 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard label="Total Receipts" value={statsLoading ? undefined : stats?.totalInteractions} icon={Activity} />
        <StatCard label="Verified" value={statsLoading ? undefined : stats?.verifiedCount} icon={CheckCircle} accent="bg-emerald-500" />
        <StatCard label="Policy Pass" value={statsLoading ? undefined : stats?.policyPassCount} icon={Shield} accent="bg-emerald-500" />
        <StatCard label="Policy Fail" value={statsLoading ? undefined : stats?.policyFailCount} icon={XCircle} accent="bg-red-500" />
        <StatCard label="Replays" value={statsLoading ? undefined : stats?.replayCount} icon={RefreshCw} accent="bg-sky-500" />
      </div>

      {/* Recent receipts + activity */}
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Recent Receipts</h2>
          </div>
          <div className="space-y-2" data-testid="recent-receipts-list">
            {recent?.items?.slice(0, 5).map((item) => (
              <Link href={`/receipts/${item.id}`} key={item.id}>
                <div className="bg-card border border-border rounded-lg px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group" data-testid={`receipt-row-${item.id}`}>
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="text-muted-foreground text-[10px] font-mono truncate">{item.id.slice(0, 14)}…</span>
                    <PolicyBadge status={item.policyStatus} />
                  </div>
                  <div className="text-sm text-foreground truncate font-medium group-hover:text-primary transition-colors">{item.prompt.slice(0, 72)}</div>
                  <div className="text-muted-foreground mt-1.5 flex gap-3 text-xs">
                    <span className="text-primary font-semibold">{item.model}</span>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </Link>
            ))}
            {!recent?.items?.length && (
              <div className="text-muted-foreground text-sm p-6 border-2 border-dashed border-border rounded-lg text-center">
                No receipts yet.{" "}
                <Link href="/receipts/new"><span className="text-primary cursor-pointer hover:underline font-semibold">Mint your first.</span></Link>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">Activity Log</h2>
          </div>
          <div className="space-y-2.5" data-testid="activity-log">
            {stats?.recentActivity?.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-start gap-3 text-sm" data-testid={`activity-item-${a.id}`}>
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${a.type === "created" ? "bg-primary" : a.type === "replayed" ? "bg-sky-400" : a.type === "verified" ? "bg-emerald-500" : "bg-amber-400"}`} />
                <div>
                  <span className="text-foreground font-medium">{a.summary}</span>
                  <div className="text-xs text-muted-foreground mt-0.5">{new Date(a.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {!stats?.recentActivity?.length && (
              <div className="text-muted-foreground text-sm p-6 border-2 border-dashed border-border rounded-lg text-center">No activity yet.</div>
            )}
          </div>

          {stats?.modelsUsed && stats.modelsUsed.length > 0 && (
            <div className="mt-5">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Models in Use</div>
              <div className="flex flex-wrap gap-1.5" data-testid="models-list">
                {stats.modelsUsed.map((m) => (
                  <Badge key={m} variant="outline" className="text-xs text-primary border-primary/30 font-semibold" data-testid={`model-badge-${m}`}>{m}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Foundation footer */}
      <div className="border-t border-border pt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium">Agents review · Humans decide · Math proves</span>
        <a href="https://www.aigovopsfoundation.org" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors font-medium">
          aigovopsfoundation.org ↗
        </a>
      </div>
    </div>
  );
}
