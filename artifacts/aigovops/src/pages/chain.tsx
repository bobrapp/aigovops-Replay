import { useGetChain } from "@workspace/api-client-react";
import { Link2, CheckCircle, XCircle, Link } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link as WouterLink } from "wouter";

export default function ChainView() {
  const { data: chain, isLoading } = useGetChain();

  return (
    <div className="space-y-6" data-testid="chain-page">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold font-mono text-foreground">Hash Chain</h1>
        {chain && (
          <span className={`flex items-center gap-1 text-xs font-mono ml-2 ${chain.intact ? "text-emerald-400" : "text-red-400"}`} data-testid="chain-integrity-badge">
            {chain.intact ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
            {chain.intact ? "INTACT" : "BROKEN"}
          </span>
        )}
      </div>

      {chain && (
        <div className="bg-card border border-border rounded-md p-4 font-mono text-xs space-y-1">
          <div className="grid grid-cols-3 gap-4 text-muted-foreground">
            <div>LENGTH <span className="text-primary ml-2" data-testid="chain-length">{chain.length}</span></div>
            <div className="col-span-2">HEAD <span className="text-foreground ml-2 truncate" data-testid="chain-head">{chain.headHash?.slice(0, 48)}…</span></div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground font-mono">Each block is linked to the previous via its chainHash. Any tampering breaks the chain.</p>

      <div className="space-y-0" data-testid="chain-entries">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full mb-2" />)
          : chain?.entries?.map((entry, idx) => (
            <div key={entry.id} className="relative" data-testid={`chain-block-${entry.id}`}>
              {idx < chain.entries.length - 1 && (
                <div className="absolute left-5 top-full w-px h-4 bg-primary/30 z-10" />
              )}
              <WouterLink href={`/receipts/${entry.id}`}>
                <div className="bg-card border border-border rounded-md p-4 font-mono text-xs hover:border-primary/40 transition-colors cursor-pointer mb-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-2 h-2 rounded-full ${idx === 0 ? "bg-primary shadow-[0_0_6px_hsl(var(--primary))]" : "bg-muted-foreground"}`} />
                    <span className="text-muted-foreground text-[10px] uppercase tracking-widest">
                      {idx === 0 ? "HEAD" : `BLOCK -${idx}`}
                    </span>
                    <span className="text-muted-foreground ml-auto">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-20">ID</span>
                      <span className="text-foreground truncate">{entry.id.slice(0, 32)}…</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-20">CHAIN</span>
                      <span className="text-primary truncate" data-testid={`block-hash-${entry.id}`}>{entry.chainHash.slice(0, 40)}…</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-20">PREV</span>
                      <span className="text-muted-foreground/70 truncate">
                        {entry.prevHash ? entry.prevHash.slice(0, 40) + "…" : <span className="text-cyan-400">(genesis)</span>}
                      </span>
                    </div>
                  </div>
                </div>
              </WouterLink>
            </div>
          ))}

        {!isLoading && !chain?.entries?.length && (
          <div className="text-muted-foreground text-xs font-mono p-8 border border-dashed border-border rounded-md text-center">
            No chain entries yet.{" "}
            <WouterLink href="/receipts/new">
              <span className="text-primary cursor-pointer hover:underline">Mint your first receipt.</span>
            </WouterLink>
          </div>
        )}
      </div>
    </div>
  );
}
