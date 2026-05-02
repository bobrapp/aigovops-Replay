import { Link, useLocation } from "wouter";
import {
  Shield, FileText, Link2, ShieldAlert, CheckCircle,
  Database, Search, Menu, X, BookOpen, Zap, Bot,
  Mic, Clock, Gauge, ChevronRight
} from "lucide-react";
import { ReactNode, useState } from "react";
import { useMode } from "@/context/mode";

const expertNav = [
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

const simpleNav = [
  { label: "Home", href: "/", icon: Shield },
  { label: "Record a Chat", href: "/record", icon: Mic },
  { label: "My Recordings", href: "/history", icon: Clock },
  { label: "Check a Recording", href: "/check", icon: Search },
  { label: "Try the Demo", href: "/demo", icon: Zap },
];

const expertMobileNav = [
  { label: "Dash", href: "/", icon: Database },
  { label: "Demo", href: "/demo", icon: Zap },
  { label: "Receipts", href: "/receipts", icon: FileText },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Chain", href: "/chain", icon: Link2 },
];

const simpleMobileNav = [
  { label: "Home", href: "/", icon: Shield },
  { label: "Record", href: "/record", icon: Mic },
  { label: "History", href: "/history", icon: Clock },
  { label: "Check", href: "/check", icon: Search },
];

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-[10px] text-white/40 uppercase tracking-[0.18em] font-semibold px-3 pt-4 pb-1.5">
      {label}
    </div>
  );
}

function NavItem({ item, active, onClick }: {
  item: { label: string; href: string; icon: React.ElementType; highlight?: boolean };
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link href={item.href} onClick={onClick}>
      <div className={`flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer transition-all text-sm font-medium
        ${active
          ? "bg-white/15 text-white"
          : item.highlight
            ? "text-emerald-300 hover:text-emerald-200 hover:bg-white/10"
            : "text-white/70 hover:text-white hover:bg-white/10"
        }`}>
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span>{item.label}</span>
        {active && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
      </div>
    </Link>
  );
}

function ModeToggle() {
  const { mode, setMode } = useMode();
  return (
    <div className="flex items-center gap-0.5 bg-white/10 rounded-lg p-0.5" data-testid="mode-toggle">
      <button
        onClick={() => setMode("simple")}
        className={`flex-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
          mode === "simple"
            ? "bg-white text-[#1B3B6F] shadow-sm"
            : "text-white/60 hover:text-white"
        }`}
        data-testid="mode-simple"
      >
        😊 Simple
      </button>
      <button
        onClick={() => setMode("expert")}
        className={`flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
          mode === "expert"
            ? "bg-white text-[#1B3B6F] shadow-sm"
            : "text-white/60 hover:text-white"
        }`}
        data-testid="mode-expert"
      >
        <Gauge className="w-3 h-3" /> Expert
      </button>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { mode } = useMode();
  const isSimple = mode === "simple";
  const mobileNav = isSimple ? simpleMobileNav : expertMobileNav;

  function isActive(href: string) {
    return href === "/" ? location === "/" : location.startsWith(href);
  }

  const ExpertSidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      {/* Foundation logo mark */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex-shrink-0">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 2L4 7v9c0 6.6 5.1 12.8 12 14.3C22.9 28.8 28 22.6 28 16V7L16 2z" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.5"/>
              <path d="M16 7L8 10.5v6c0 4 3.1 7.7 8 8.7 4.9-1 8-4.7 8-8.7v-6L16 7z" fill="white" fillOpacity="0.2"/>
              <path d="M12 16l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="font-bold text-white text-sm leading-tight tracking-tight">AIGovOps</div>
            <div className="text-white/50 text-[10px] leading-tight tracking-wide uppercase">Foundation · REPLAY</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-2 overflow-y-auto">
        <SectionLabel label="Workspace" />
        {expertNav.filter(n => n.group === "main").map(item => (
          <NavItem key={item.href} item={item} active={isActive(item.href)} onClick={onNav} />
        ))}
        <SectionLabel label="Audit Trail" />
        {expertNav.filter(n => n.group === "audit").map(item => (
          <NavItem key={item.href} item={item} active={isActive(item.href)} onClick={onNav} />
        ))}
        <SectionLabel label="Governance" />
        {expertNav.filter(n => n.group === "policy").map(item => (
          <NavItem key={item.href} item={item} active={isActive(item.href)} onClick={onNav} />
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-white/10">
        <ModeToggle />
      </div>

      <div className="px-4 py-3 border-t border-white/10">
        <div className="text-[10px] text-white/40 uppercase tracking-widest leading-relaxed">
          Agents review · Humans decide<br />Math proves
        </div>
      </div>
    </>
  );

  const SimpleSidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex-shrink-0">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 2L4 7v9c0 6.6 5.1 12.8 12 14.3C22.9 28.8 28 22.6 28 16V7L16 2z" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.5"/>
              <path d="M16 7L8 10.5v6c0 4 3.1 7.7 8 8.7 4.9-1 8-4.7 8-8.7v-6L16 7z" fill="white" fillOpacity="0.2"/>
              <path d="M12 16l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="font-bold text-white text-sm leading-tight">AI Safety Hub</div>
            <div className="text-white/50 text-[10px] uppercase tracking-wide">AiGovOps Foundation</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {simpleNav.map(item => (
          <Link key={item.href} href={item.href} onClick={onNav}>
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all text-sm font-medium
              ${isActive(item.href)
                ? "bg-white/15 text-white"
                : "text-white/70 hover:text-white hover:bg-white/10"
              }`}>
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
              {isActive(item.href) && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
            </div>
          </Link>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-white/10">
        <ModeToggle />
      </div>

      <div className="px-4 py-3 border-t border-white/10">
        <div className="text-[10px] text-white/40 uppercase tracking-widest">
          From Intentions to Evidence
        </div>
      </div>
    </>
  );

  const SidebarContent = isSimple ? SimpleSidebarContent : ExpertSidebarContent;

  return (
    <div className="flex h-screen w-full bg-background text-foreground">

      {/* Desktop sidebar — foundation navy */}
      <aside className="hidden md:flex w-56 flex-col h-full flex-shrink-0" style={{ background: "#1B3B6F" }}>
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-60 flex flex-col z-10" style={{ background: "#1B3B6F" }}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 flex-shrink-0">
                  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 2L4 7v9c0 6.6 5.1 12.8 12 14.3C22.9 28.8 28 22.6 28 16V7L16 2z" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.5"/>
                    <path d="M12 16l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="font-bold text-white text-sm">{isSimple ? "AI Safety Hub" : "AIGovOps"}</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-white/60 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarContent onNav={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-white flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: "#1B3B6F" }}>
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-bold text-foreground text-sm leading-none">{isSimple ? "AI Safety Hub" : "AIGovOps REPLAY"}</div>
              <div className="text-[9px] text-muted-foreground leading-none mt-0.5">AiGovOps Foundation</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <button onClick={() => setDrawerOpen(true)} className="text-muted-foreground hover:text-foreground p-1">
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-background">
          <div className={`p-6 md:p-8 w-full mx-auto ${isSimple ? "max-w-lg" : "max-w-5xl"}`}>
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex border-t border-border bg-white flex-shrink-0">
          {mobileNav.map(item => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div className={`flex flex-col items-center gap-1 py-2.5 px-1 transition-colors ${active ? "text-[#1B3B6F]" : "text-muted-foreground"}`}>
                  <item.icon className="w-4 h-4" />
                  <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">{item.label.slice(0, 7)}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
