import { useGetStats, useGetChain } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Shield, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";

function BigActionTile({
  emoji,
  title,
  subtitle,
  href,
  color,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  href: string;
  color: string;
}) {
  return (
    <Link href={href}>
      <div
        className={`rounded-2xl p-5 cursor-pointer transition-all active:scale-95 hover:shadow-lg border-2 ${color} flex flex-col gap-2 select-none`}
        data-testid={`simple-action-${title.toLowerCase().replace(/\s/g, "-")}`}
      >
        <span className="text-4xl leading-none">{emoji}</span>
        <div>
          <div className="text-base font-bold text-foreground leading-tight">{title}</div>
          <div className="text-sm text-muted-foreground mt-0.5">{subtitle}</div>
        </div>
      </div>
    </Link>
  );
}

function StatusPill({ ok, loading }: { ok?: boolean; loading: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm bg-muted text-muted-foreground">
        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
        Checking…
      </span>
    );
  }
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
        <CheckCircle className="w-3.5 h-3.5" /> Everything looks good
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm bg-red-500/15 text-red-500 border border-red-500/30">
      <XCircle className="w-3.5 h-3.5" /> Issue detected
    </span>
  );
}

export default function SimpleHome() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: chain, isLoading: chainLoading } = useGetChain();

  const failCount = stats?.policyFailCount ?? 0;
  const totalCount = stats?.totalInteractions ?? 0;

  return (
    <div className="space-y-7 max-w-lg mx-auto" data-testid="simple-home-page">
      {/* Header */}
      <div className="text-center pt-4 space-y-2">
        <div className="flex justify-center mb-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #1B3B6F 0%, #10b981 100%)" }}
          >
            <Shield className="w-8 h-8 text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Your AI Safety Hub</h1>
        <p className="text-muted-foreground text-sm">Track and protect every AI conversation</p>
        <div className="flex justify-center pt-1">
          <StatusPill ok={chain?.intact} loading={chainLoading} />
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-2xl font-bold text-foreground">
            {statsLoading ? "–" : totalCount}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Recordings</div>
        </div>
        <div className="bg-card border border-emerald-500/20 rounded-xl p-3">
          <div className="text-2xl font-bold text-emerald-500">
            {statsLoading ? "–" : stats?.policyPassCount ?? 0}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Safe</div>
        </div>
        <div className={`bg-card rounded-xl p-3 border ${failCount > 0 ? "border-red-500/30" : "border-border"}`}>
          <div className={`text-2xl font-bold ${failCount > 0 ? "text-red-500" : "text-foreground"}`}>
            {statsLoading ? "–" : failCount}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Issues</div>
        </div>
      </div>

      {/* Alert if there are issues */}
      {!statsLoading && failCount > 0 && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-red-500 text-sm">
              {failCount} recording{failCount > 1 ? "s" : ""} {failCount > 1 ? "have" : "has"} an issue
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Check your recordings to see what needs attention.
            </div>
          </div>
        </div>
      )}

      {/* Big action tiles */}
      <div className="grid grid-cols-2 gap-3">
        <BigActionTile
          emoji="🎙️"
          title="Record a Chat"
          subtitle="Save an AI conversation"
          href="/record"
          color="border-primary/30 bg-primary/5 hover:border-primary/60"
        />
        <BigActionTile
          emoji="📋"
          title="My Recordings"
          subtitle="See all saved chats"
          href="/history"
          color="border-cyan-500/30 bg-cyan-500/5 hover:border-cyan-500/60"
        />
        <BigActionTile
          emoji="🔍"
          title="Check a Recording"
          subtitle="Is it safe and unmodified?"
          href="/check"
          color="border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60"
        />
        <BigActionTile
          emoji="⚡"
          title="Try the Demo"
          subtitle="See how it works"
          href="/demo"
          color="border-yellow-500/30 bg-yellow-500/5 hover:border-yellow-500/60"
        />
      </div>

      {/* Recent activity */}
      {stats?.recentActivity && stats.recentActivity.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground mb-3">
            <Clock className="w-4 h-4" /> Recent Activity
          </div>
          <div className="space-y-2">
            {stats.recentActivity.slice(0, 4).map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 text-sm"
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${a.type === "created" ? "bg-primary" : a.type === "replayed" ? "bg-cyan-400" : a.type === "verified" ? "bg-emerald-400" : "bg-yellow-400"}`} />
                <span className="text-foreground truncate">{a.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground pb-4">
        Powered by AIGovOps Foundation · Math proves it's safe
      </p>
    </div>
  );
}
