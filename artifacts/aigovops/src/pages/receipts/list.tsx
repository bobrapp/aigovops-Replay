import { useState } from "react";
import { useListInteractions, getListInteractionsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { FileText, Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ListInteractionsPolicyStatus } from "@workspace/api-client-react";

function PolicyBadge({ status }: { status: "pass" | "fail" | "pending" }) {
  const map = {
    pass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    fail: "bg-red-500/10 text-red-400 border-red-500/30",
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-mono uppercase tracking-wide ${map[status]}`}>
      {status}
    </span>
  );
}

export default function ReceiptsList() {
  const [model, setModel] = useState<string>("");
  const [policyStatus, setPolicyStatus] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const params = {
    limit,
    offset,
    ...(model ? { model } : {}),
    ...(policyStatus !== "all" ? { policyStatus: policyStatus as "pass" | "fail" | "pending" } : {}),
  };

  const { data, isLoading } = useListInteractions(params, {
    query: { queryKey: getListInteractionsQueryKey(params) },
  });

  return (
    <div className="space-y-6" data-testid="receipts-list-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold font-mono text-foreground">Receipts</h1>
          {data && <span className="text-xs text-muted-foreground font-mono">({data.total} total)</span>}
        </div>
        <Link href="/receipts/new">
          <Button size="sm" className="font-mono text-xs gap-2" data-testid="button-mint-receipt">
            <Plus className="w-3 h-3" />MINT RECEIPT
          </Button>
        </Link>
      </div>

      <div className="flex gap-3 items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filter by model..."
          value={model}
          onChange={(e) => { setModel(e.target.value); setOffset(0); }}
          className="w-48 font-mono text-xs"
          data-testid="input-filter-model"
        />
        <Select value={policyStatus} onValueChange={(v) => { setPolicyStatus(v); setOffset(0); }}>
          <SelectTrigger className="w-36 font-mono text-xs" data-testid="select-policy-status">
            <SelectValue placeholder="Policy status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pass">Pass</SelectItem>
            <SelectItem value="fail">Fail</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2" data-testid="receipts-table">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          : data?.items?.map((item) => (
            <Link href={`/receipts/${item.id}`} key={item.id}>
              <div className="bg-card border border-border rounded-md p-4 font-mono text-xs hover:border-primary/40 transition-colors cursor-pointer group" data-testid={`receipt-row-${item.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-muted-foreground text-[10px]">{item.id.slice(0, 20)}…</span>
                      <PolicyBadge status={item.policyStatus} />
                      {item.replayCount > 0 && (
                        <span className="text-[10px] text-cyan-400 border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                          {item.replayCount}x REPLAYED
                        </span>
                      )}
                    </div>
                    <div className="text-foreground truncate group-hover:text-primary transition-colors">{item.prompt.slice(0, 100)}</div>
                    <div className="text-muted-foreground mt-1 flex gap-4">
                      <span className="text-primary/70">{item.model}</span>
                      <span>{item.userId}</span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] text-muted-foreground">HASH</div>
                    <div className="text-[10px] text-foreground font-mono">{item.chainHash.slice(0, 16)}…</div>
                  </div>
                </div>
              </div>
            </Link>
          ))}

        {!isLoading && !data?.items?.length && (
          <div className="text-muted-foreground text-xs font-mono p-8 border border-dashed border-border rounded-md text-center">
            No receipts found.{" "}
            <Link href="/receipts/new">
              <span className="text-primary cursor-pointer hover:underline">Mint your first receipt.</span>
            </Link>
          </div>
        )}
      </div>

      {data && data.total > limit && (
        <div className="flex items-center gap-3 justify-center font-mono text-xs">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} data-testid="button-prev-page">
            PREV
          </Button>
          <span className="text-muted-foreground">{Math.floor(offset / limit) + 1} / {Math.ceil(data.total / limit)}</span>
          <Button variant="outline" size="sm" disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)} data-testid="button-next-page">
            NEXT
          </Button>
        </div>
      )}
    </div>
  );
}
