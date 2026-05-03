import { useGetChain } from "@workspace/api-client-react";
import { Link2, CheckCircle, XCircle, Download, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link as WouterLink } from "wouter";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";

const EXPORT_FORMATS = [
  { label: "JSONL", ext: "jsonl", path: "/api/export/jsonl", desc: "One JSON object per line — for programmatic use" },
  { label: "HTML Bundle", ext: "html", path: "/api/export/html", desc: "Self-contained file with embedded chain verifier" },
  { label: "SQLite", ext: "db", path: "/api/export/sqlite", desc: "Offline-queryable with sqlite3 or DB Browser" },
] as const;

function DownloadDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 font-semibold"
        onClick={() => setOpen((v) => !v)}
        data-testid="button-download-chain"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Download className="w-4 h-4" />
        Download chain
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg w-72 overflow-hidden">
          {EXPORT_FORMATS.map((fmt) => (
            <a
              key={fmt.ext}
              href={fmt.path}
              download
              className="flex items-start gap-3 px-4 py-3 hover:bg-muted transition-colors group"
              onClick={() => setOpen(false)}
              data-testid={`download-${fmt.ext}`}
            >
              <div className="mt-0.5 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                <Download className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{fmt.label}</div>
                <div className="text-xs text-muted-foreground leading-snug mt-0.5">{fmt.desc}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChainView() {
  const { data: chain, isLoading } = useGetChain();

  return (
    <div className="space-y-6" data-testid="chain-page">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#1B3B6F" }}>
            <Link2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-foreground">Hash Chain</h1>
              {chain && (
                <span className={`flex items-center gap-1.5 text-sm font-semibold ${chain.intact ? "text-emerald-600" : "text-red-600"}`} data-testid="chain-integrity-badge">
                  {chain.intact ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {chain.intact ? "Intact" : "Broken"}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Tamper-evident append-only log</p>
          </div>
        </div>
        <DownloadDropdown />
      </div>

      {chain && (
        <div className="bg-card border border-border rounded-lg p-4 text-sm">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Length</div>
              <div className="font-bold text-foreground text-lg" data-testid="chain-length">{chain.length}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">Head Hash</div>
              <div className="text-foreground font-mono text-xs truncate" data-testid="chain-head">{chain.headHash?.slice(0, 52)}…</div>
            </div>
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Each block links to the previous via its chain hash. Any tampering breaks the sequence.
      </p>

      <div className="space-y-0" data-testid="chain-entries">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full mb-3" />)
          : chain?.entries?.map((entry, idx) => (
            <div key={entry.id} className="relative" data-testid={`chain-block-${entry.id}`}>
              {idx < chain.entries.length - 1 && (
                <div className="absolute left-5 top-full w-0.5 h-4 bg-primary/20 z-10" />
              )}
              <WouterLink href={`/receipts/${entry.id}`}>
                <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${idx === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${idx === 0 ? "text-primary" : "text-muted-foreground"}`}>
                      {idx === 0 ? "HEAD" : `Block −${idx}`}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex gap-3">
                      <span className="text-muted-foreground font-semibold uppercase tracking-wide w-16 flex-shrink-0">ID</span>
                      <span className="text-foreground font-mono truncate">{entry.id.slice(0, 32)}…</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-muted-foreground font-semibold uppercase tracking-wide w-16 flex-shrink-0">Chain</span>
                      <span className="text-primary font-mono truncate" data-testid={`block-hash-${entry.id}`}>{entry.chainHash.slice(0, 40)}…</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-muted-foreground font-semibold uppercase tracking-wide w-16 flex-shrink-0">Prev</span>
                      <span className="font-mono truncate text-muted-foreground/70">
                        {entry.prevHash ? entry.prevHash.slice(0, 40) + "…" : <span className="text-sky-600 font-semibold">genesis</span>}
                      </span>
                    </div>
                  </div>
                </div>
              </WouterLink>
            </div>
          ))}

        {!isLoading && !chain?.entries?.length && (
          <div className="text-muted-foreground text-sm p-10 border-2 border-dashed border-border rounded-lg text-center">
            No chain entries yet.{" "}
            <WouterLink href="/receipts/new">
              <span className="text-primary cursor-pointer hover:underline font-semibold">Mint your first receipt.</span>
            </WouterLink>
          </div>
        )}
      </div>
    </div>
  );
}
