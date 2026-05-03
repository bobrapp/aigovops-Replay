import { useState } from "react";
import { useListInteractions, getListInteractionsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Clock, Plus, CheckCircle, XCircle, AlertCircle, ChevronRight, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function StatusIcon({ status }: { status: "pass" | "fail" | "pending" }) {
  if (status === "pass")
    return <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />;
  if (status === "fail")
    return <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />;
  return <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />;
}

function StatusLabel({ status }: { status: "pass" | "fail" | "pending" }) {
  if (status === "pass")
    return <span className="text-xs text-emerald-500 font-medium">Safe</span>;
  if (status === "fail")
    return <span className="text-xs text-red-500 font-medium">Needs Review</span>;
  return <span className="text-xs text-yellow-500 font-medium">Checking...</span>;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const AI_TOOL_LABELS: Record<string, string> = {
  "gpt-4o": "ChatGPT",
  "gpt-4": "ChatGPT",
  "claude-3-5-sonnet": "Claude",
  "claude-3-5": "Claude",
  "gemini-pro": "Gemini",
  "gemini-1.5": "Gemini",
  "copilot": "Copilot",
};

function friendlyModel(model: string) {
  const lower = model.toLowerCase();
  for (const [key, label] of Object.entries(AI_TOOL_LABELS)) {
    if (lower.includes(key)) return label;
  }
  return model;
}

export default function SimpleHistory() {
  const [offset, setOffset] = useState(0);
  const limit = 15;

  const { data, isLoading } = useListInteractions(
    { limit, offset },
    { query: { queryKey: getListInteractionsQueryKey({ limit, offset }) } }
  );

  return (
    <div className="max-w-lg mx-auto space-y-5" data-testid="simple-history-page">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Recordings</h1>
          {data && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {data.total} saved chat{data.total !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/certificate">
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5 font-semibold text-primary border-primary/30 hover:bg-primary/5" data-testid="simple-history-certificate-btn">
              <Award className="w-3.5 h-3.5" />Certificate
            </Button>
          </Link>
          <Link href="/record">
            <Button className="rounded-xl gap-2" data-testid="simple-new-recording">
              <Plus className="w-4 h-4" /> New
            </Button>
          </Link>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))
          : data?.items?.map((item) => (
              <Link href={`/receipts/${item.id}`} key={item.id}>
                <div
                  className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3 hover:border-primary/40 transition-colors cursor-pointer"
                  data-testid={`simple-history-row-${item.id}`}
                >
                  <StatusIcon status={item.policyStatus} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate leading-snug">
                      {item.prompt.slice(0, 80)}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusLabel status={item.policyStatus} />
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{friendlyModel(item.model)}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" /> {timeAgo(item.createdAt)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </Link>
            ))}

        {!isLoading && !data?.items?.length && (
          <div className="text-center py-12 space-y-4">
            <div className="text-5xl">📭</div>
            <div>
              <div className="font-semibold text-foreground">No recordings yet</div>
              <div className="text-sm text-muted-foreground mt-1">
                Start recording your AI conversations to keep them safe.
              </div>
            </div>
            <Link href="/record">
              <Button className="rounded-xl">Make Your First Recording</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex items-center gap-3 justify-center pb-4">
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            ← Older
          </Button>
          <span className="text-sm text-muted-foreground">
            {Math.floor(offset / limit) + 1} / {Math.ceil(data.total / limit)}
          </span>
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={offset + limit >= data.total}
            onClick={() => setOffset(offset + limit)}
          >
            Newer →
          </Button>
        </div>
      )}
    </div>
  );
}
