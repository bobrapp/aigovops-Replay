import { Link, useLocation } from "wouter";
import { Shield, FileText, Link2, ShieldAlert, CheckCircle, Database, Search, Menu, X, BookOpen, Zap } from "lucide-react";
import { ReactNode, useState } from "react";

const nav = [
  { label: "Dashboard", href: "/", icon: Database },
  { label: "Live Demo", href: "/demo", icon: Zap },
  { label: "Receipts", href: "/receipts", icon: FileText },
  { label: "Mint Receipt", href: "/receipts/new", icon: CheckCircle },
  { label: "Verify", href: "/verify", icon: Search },
  { label: "Chain", href: "/chain", icon: Link2 },
  { label: "Policies", href: "/policies", icon: ShieldAlert },
  { label: "Open Spec", href: "/spec", icon: BookOpen },
];

function NavItem({ item, active, onClick }: { item: typeof nav[0]; active: boolean; onClick?: () => void }) {
  return (
    <Link href={item.href} onClick={onClick}>
      <div className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm font-medium">{item.label}</span>
      </div>
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  function isActive(href: string) {
    return href === "/" ? location === "/" : location.startsWith(href);
  }

  return (
    <div className="flex h-screen w-full bg-background text-foreground font-mono">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 border-r border-border bg-card flex-col h-full flex-shrink-0">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Shield className="text-primary w-5 h-5" />
          <span className="font-bold tracking-tight text-primary text-sm">REPLAY</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map((item) => (
            <NavItem key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </nav>
        <div className="p-3 border-t border-border text-xs text-muted-foreground text-center">
          SYS_SECURE_MODE_ON
        </div>
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-card border-r border-border flex flex-col z-10">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="text-primary w-5 h-5" />
                <span className="font-bold tracking-tight text-primary">REPLAY</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
              {nav.map((item) => (
                <NavItem key={item.href} item={item} active={isActive(item.href)} onClick={() => setDrawerOpen(false)} />
              ))}
            </nav>
            <div className="p-3 border-t border-border text-xs text-muted-foreground text-center">
              SYS_SECURE_MODE_ON
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="text-primary w-4 h-4" />
            <span className="font-bold tracking-tight text-primary text-sm">REPLAY</span>
          </div>
          <button onClick={() => setDrawerOpen(true)} className="text-muted-foreground hover:text-foreground p-1">
            <Menu className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 overflow-auto relative">
          <div className="absolute inset-0 pointer-events-none opacity-10" style={{ backgroundImage: "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMSIvPjxwYXRoIGQ9Ik0wIDBINFY0SDBaIiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz48L3N2Zz4=')" }}></div>
          <div className="p-4 md:p-8 max-w-5xl w-full mx-auto relative z-10">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex border-t border-border bg-card flex-shrink-0">
          {nav.slice(0, 5).map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div className={`flex flex-col items-center gap-0.5 py-2 px-1 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                  <item.icon className="w-4 h-4" />
                  <span className="text-[9px] font-mono leading-none">{item.label.split(" ")[0].toUpperCase()}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
