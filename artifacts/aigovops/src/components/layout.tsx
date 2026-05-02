import { Link, useLocation } from "wouter";
import { Shield, FileText, Link2, ShieldAlert, CheckCircle, Database, Search } from "lucide-react";
import { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const nav = [
    { label: "Dashboard", href: "/", icon: Database },
    { label: "Receipts", href: "/receipts", icon: FileText },
    { label: "Mint Receipt", href: "/receipts/new", icon: CheckCircle },
    { label: "Verify", href: "/verify", icon: Search },
    { label: "Chain", href: "/chain", icon: Link2 },
    { label: "Policies", href: "/policies", icon: ShieldAlert },
  ];

  return (
    <div className="flex h-screen w-full bg-background text-foreground font-mono">
      <aside className="w-64 border-r border-border bg-card flex flex-col h-full">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Shield className="text-primary w-6 h-6" />
          <span className="font-bold tracking-tight text-primary">REPLAY</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {nav.map((item) => {
            const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <item.icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border text-xs text-muted-foreground text-center">
          SYS_SECURE_MODE_ON
        </div>
      </aside>
      <main className="flex-1 overflow-auto flex flex-col relative h-full">
        <div className="absolute inset-0 pointer-events-none opacity-20" style={{ backgroundImage: "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDEiLz4KPHBhdGggZD0iTTAgMEg0VjRIMEoiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPgo8L3N2Zz4=')" }}></div>
        <div className="p-6 md:p-8 max-w-6xl w-full mx-auto relative z-10 flex-1 flex flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}