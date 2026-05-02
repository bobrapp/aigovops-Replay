import { Link, useLocation } from "wouter";
import {
  Shield, FileText, Link2, ShieldAlert, CheckCircle,
  Database, Search, Menu, X, BookOpen, Zap, Bot
} from "lucide-react";
import { ReactNode, useState } from "react";

const nav = [
  { label: "Dashboard", href: "/", icon: Database, group: "main" },
  { label: "Live Demo", href: "/demo", icon: Zap, group: "main", highlight: true },
  { label: "Receipts", href: "/receipts", icon: FileText, group: "audit" },
  { label: "Mint Receipt", href: "/receipts/new", icon: CheckCircle, group: "audit" },
  { label: "Agents", href: "/agents", icon: Bot, group: "audit" },
  { label: "Verify", href: "/verify", icon: Search, group: "audit" },
  { label: "Chain", href: "/chain", icon: Link2, group: "audit" },
  { label: "Policies", href: "/policies", icon: ShieldAlert, group: "policy" },
  { label: "Open Spec", href: "/spec", icon: BookOpen, group: "policy" },
];

const mobileNav = [
  { label: "Dash", href: "/", icon: Database },
  { label: "Demo", href: "/demo", icon: Zap },
  { label: "Receipts", href: "/receipts", icon: FileText },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Chain", href: "/chain", icon: Link2 },
];

function NavItem({ item, active, onClick }: {
  item: typeof nav[0];
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link href={item.href} onClick={onClick}>
      <div className={`flex items-center gap-2.5 px-3 py-2 rounded cursor-pointer transition-all text-xs font-mono font-medium
        ${active
          ? "bg-primary/10 text-primary"
          : item.highlight
            ? "text-yellow-400/80 hover:text-yellow-400 hover:bg-yellow-400/5"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}>
        <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{item.label}</span>
      </div>
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-[9px] text-muted-foreground/50 uppercase tracking-[0.15em] font-mono px-3 pt-3 pb-1">
      {label}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  function isActive(href: string) {
    return href === "/" ? location === "/" : location.startsWith(href);
  }

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          {/* Foundation-navy shield mark */}
          <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #1B3B6F 0%, #10b981 100%)" }}>
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-bold tracking-tight text-foreground text-sm font-mono leading-none">REPLAY</div>
            <div className="text-[9px] text-muted-foreground font-mono leading-none mt-0.5">AiGovOps Foundation</div>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        <SectionLabel label="Workspace" />
        {nav.filter(n => n.group === "main").map(item => (
          <NavItem key={item.href} item={item} active={isActive(item.href)} onClick={onNav} />
        ))}
        <SectionLabel label="Audit" />
        {nav.filter(n => n.group === "audit").map(item => (
          <NavItem key={item.href} item={item} active={isActive(item.href)} onClick={onNav} />
        ))}
        <SectionLabel label="Governance" />
        {nav.filter(n => n.group === "policy").map(item => (
          <NavItem key={item.href} item={item} active={isActive(item.href)} onClick={onNav} />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border space-y-0.5">
        <div className="text-[9px] text-muted-foreground/60 font-mono uppercase tracking-widest">
          Agents review · Humans decide
        </div>
        <div className="text-[9px] text-primary/60 font-mono">Math proves</div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full bg-background text-foreground font-mono">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 border-r border-border bg-card flex-col h-full flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-56 bg-card border-r border-border flex flex-col z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1B3B6F 0%, #10b981 100%)" }}>
                  <Shield className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-bold text-sm font-mono text-foreground">REPLAY</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-muted-foreground hover:text-foreground p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarContent onNav={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1B3B6F 0%, #10b981 100%)" }}>
              <Shield className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="font-bold text-sm font-mono text-foreground leading-none">REPLAY</div>
              <div className="text-[8px] text-muted-foreground font-mono leading-none">AiGovOps Foundation</div>
            </div>
          </div>
          <button onClick={() => setDrawerOpen(true)} className="text-muted-foreground hover:text-foreground p-1">
            <Menu className="w-5 h-5" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto relative">
          <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{ backgroundImage: "radial-gradient(circle at 20% 50%, #1B3B6F 0%, transparent 60%), radial-gradient(circle at 80% 50%, #10b981 0%, transparent 60%)" }} />
          <div className="p-4 md:p-8 max-w-5xl w-full mx-auto relative z-10">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex border-t border-border bg-card flex-shrink-0">
          {mobileNav.map(item => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div className={`flex flex-col items-center gap-0.5 py-2 px-1 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}>
                  <item.icon className="w-4 h-4" />
                  <span className="text-[9px] font-mono leading-none">{item.label.toUpperCase()}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
