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
    pass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    fail: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${map[status]}`}>
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
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Receipts</h1>
            {data && <p className="text-sm text-muted-foreground">{data.total} total interactions</p>}
          </div>
        </div>
        <Link href="/receipts/new">
          <Button size="sm" className="gap-2 font-semibold" data-testid="button-mint-receipt">
            <Plus className="w-4 h-4" />Mint Receipt
          </Button>
        </Link>
      </div>

      <div className="flex gap-3 items-center">
        <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <Input
          placeholder="Filter by model..."
          value={model}
          onChange={(e) => { setModel(e.target.value); setOffset(0); }}
          className="w-48 text-sm"
          data-testid="input-filter-model"
        />
        <Select value={policyStatus} onValueChange={(v) => { setPolicyStatus(v); setOffset(0); }}>
          <SelectTrigger className="w-40 text-sm" data-testid="select-policy-status">
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
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          : data?.items?.map((item) => (
            <Link href={`/receipts/${item.id}`} key={item.id}>
              <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group" data-testid={`receipt-row-${item.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-muted-foreground text-[10px] font-mono">{item.id.slice(0, 20)}…</span>
                      <PolicyBadge status={item.policyStatus} />
                      {item.replayCount > 0 && (
                        <span className="text-[10px] text-sky-700 border border-sky-200 bg-sky-50 px-2 py-0.5 rounded-full font-semibold">
                          {item.replayCount}× Replayed
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-foreground truncate font-medium group-hover:text-primary transition-colors">{item.prompt.slice(0, 100)}</div>
                    <div className="text-muted-foreground mt-1.5 flex gap-4 text-xs">
                      <span className="text-primary font-semibold">{item.model}</span>
                      <span>{item.userId}</span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Hash</div>
                    <div className="text-[10px] text-foreground font-mono mt-0.5">{item.chainHash.slice(0, 16)}…</div>
                  </div>
                </div>
              </div>
            </Link>
          ))}

        {!isLoading && !data?.items?.length && (
          <div className="text-muted-foreground text-sm p-10 border-2 border-dashed border-border rounded-lg text-center">
            No receipts found.{" "}
            <Link href="/receipts/new">
              <span className="text-primary cursor-pointer hover:underline font-semibold">Mint your first receipt.</span>
            </Link>
          </div>
        )}
      </div>

      {data && data.total > limit && (
        <div className="flex items-center gap-3 justify-center text-sm">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} data-testid="button-prev-page">
            Previous
          </Button>
          <span className="text-muted-foreground font-medium">{Math.floor(offset / limit) + 1} / {Math.ceil(data.total / limit)}</span>
          <Button variant="outline" size="sm" disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)} data-testid="button-next-page">
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
