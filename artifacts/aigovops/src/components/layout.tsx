import { Link, useLocation } from "wouter";
import {
  Shield, FileText, Link2, ShieldAlert, CheckCircle,
  Database, Search, Menu, X, BookOpen, Zap, Bot,
  Mic, Clock, Gauge, ChevronRight, ChevronDown, ChevronUp,
  Heart, ExternalLink, LogIn, GraduationCap, Award
} from "lucide-react";
import { ReactNode, useState } from "react";
import { useMode } from "@/context/mode";
import { useAuth } from "@workspace/replit-auth-web";

const expertNav = [
  { label: "Tutorial", href: "/tutorial", icon: GraduationCap, group: "main", highlight: true },
  { label: "Dashboard", href: "/", icon: Database, group: "main" },
  { label: "Live Demo", href: "/demo", icon: Zap, group: "main" },
  { label: "Receipts", href: "/receipts", icon: FileText, group: "audit" },
  { label: "Mint Receipt", href: "/receipts/new", icon: CheckCircle, group: "audit" },
  { label: "Agents", href: "/agents", icon: Bot, group: "audit" },
  { label: "Verify", href: "/verify", icon: Search, group: "audit" },
  { label: "Chain", href: "/chain", icon: Link2, group: "audit" },
  { label: "Certificate", href: "/certificate", icon: Award, group: "audit" },
  { label: "Policies", href: "/policies", icon: ShieldAlert, group: "policy" },
  { label: "Open Spec", href: "/spec", icon: BookOpen, group: "policy" },
];

const simpleNav = [
  { label: "Tutorial", href: "/tutorial", icon: GraduationCap, highlight: true },
  { label: "Home", href: "/", icon: Shield },
  { label: "Record a Chat", href: "/record", icon: Mic },
  { label: "My Recordings", href: "/history", icon: Clock },
  { label: "Check a Recording", href: "/check", icon: Search },
  { label: "Try the Demo", href: "/demo", icon: Zap },
  { label: "Certificate", href: "/certificate", icon: Award },
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

/** Mini shield mascot used inside the sidebar guide panel */
function MiniShield() {
  return (
    <svg width="32" height="32" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M48 8L14 22v22c0 19.8 15.4 38.4 34 42.4C65.6 82.4 82 63.8 82 44V22L48 8z"
        fill="rgba(27,59,111,0.9)" stroke="rgba(16,185,129,0.7)" strokeWidth="3"
      />
      <path
        d="M48 18L24 28.5v17c0 13.8 10.8 26.8 24 29.8 13.2-3 24-16 24-29.8v-17L48 18z"
        fill="rgba(16,185,129,0.15)"
      />
      <circle cx="38" cy="43" r="4" fill="#10B981" />
      <circle cx="58" cy="43" r="4" fill="#10B981" />
      <circle cx="39.8" cy="41.2" r="1.4" fill="rgba(255,255,255,0.7)" />
      <circle cx="59.8" cy="41.2" r="1.4" fill="rgba(255,255,255,0.7)" />
      <path d="M40 55 Q48 62 56 55" stroke="#10B981" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

const guideTips: Record<"simple" | "expert", { headline: string; body: string }[]> = {
  simple: [
    {
      headline: "Record a chat",
      body: "Paste your AI conversation to create a signed, tamper-proof receipt.",
    },
    {
      headline: "Check a recording",
      body: "Verify any receipt's cryptographic hash to confirm it hasn't been altered.",
    },
    {
      headline: "Your history",
      body: "All your receipts are stored and linked in a chain — only you can see them.",
    },
  ],
  expert: [
    {
      headline: "Mint receipts via API",
      body: "POST /api/interactions to create signed receipts programmatically.",
    },
    {
      headline: "Verify the chain",
      body: "Chain view shows every link's hash — a broken link means tampering.",
    },
    {
      headline: "Write a policy rule",
      body: "Policy rules auto-flag interactions that violate your governance rules.",
    },
  ],
};

function GuidePanel() {
  const { mode } = useMode();
  const [open, setOpen] = useState(true);
  const [tipIdx, setTipIdx] = useState(0);
  const tips = guideTips[mode];
  const tip = tips[tipIdx % tips.length];

  return (
    <div className="mx-3 mb-3 rounded-xl overflow-hidden border border-white/10" style={{ background: "rgba(255,255,255,0.05)" }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors"
      >
        <MiniShield />
        <div className="flex-1 text-left min-w-0">
          <div className="text-white text-xs font-semibold leading-tight">RELAY Guide</div>
          <div className="text-white/40 text-[10px] leading-tight">Tap for tips</div>
        </div>
        {open ? <ChevronUp className="w-3 h-3 text-white/40 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-white/40 flex-shrink-0" />}
      </button>

      {/* Tip card */}
      {open && (
        <div className="px-3 pb-3">
          <div className="rounded-lg p-3" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}>
            <div className="text-emerald-300 text-xs font-semibold mb-1">{tip.headline}</div>
            <div className="text-white/60 text-[11px] leading-relaxed">{tip.body}</div>
          </div>
          {/* Tip navigation dots */}
          <div className="flex items-center justify-center gap-1.5 mt-2.5">
            {tips.map((_, i) => (
              <button
                key={i}
                onClick={() => setTipIdx(i)}
                className={`rounded-full transition-all ${i === tipIdx % tips.length ? "w-4 h-1.5 bg-emerald-400" : "w-1.5 h-1.5 bg-white/20 hover:bg-white/40"}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Two-card mode toggle that makes the choice unmistakably visible */
function ModeToggle() {
  const { mode, setMode } = useMode();
  return (
    <div className="mx-3 mb-3" data-testid="mode-toggle">
      <div className="text-[10px] text-white/35 uppercase tracking-widest font-semibold mb-2 px-0.5">View mode</div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => setMode("simple")}
          data-testid="mode-simple"
          className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-xs font-bold transition-all border ${
            mode === "simple"
              ? "bg-emerald-400/15 border-emerald-400/50 text-emerald-300"
              : "bg-white/5 border-white/10 text-white/50 hover:border-white/25 hover:text-white/80 hover:bg-white/8"
          }`}
        >
          <span className="text-base leading-none">😊</span>
          <span>Simple</span>
          {mode === "simple" && <span className="w-1 h-1 rounded-full bg-emerald-400" />}
        </button>
        <button
          onClick={() => setMode("expert")}
          data-testid="mode-expert"
          className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-xs font-bold transition-all border ${
            mode === "expert"
              ? "bg-blue-400/15 border-blue-400/50 text-blue-300"
              : "bg-white/5 border-white/10 text-white/50 hover:border-white/25 hover:text-white/80 hover:bg-white/8"
          }`}
        >
          <Gauge className="w-4 h-4" />
          <span>Expert</span>
          {mode === "expert" && <span className="w-1 h-1 rounded-full bg-blue-400" />}
        </button>
      </div>
    </div>
  );
}

/** Foundation link + donate panel shown at the bottom of the sidebar */
function FoundationPanel() {
  const { isAuthenticated, login } = useAuth();

  return (
    <div className="mx-3 mb-3 space-y-2">
      {/* Sign in prompt for guests */}
      {!isAuthenticated && (
        <button
          onClick={login}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/20 transition-colors"
          data-testid="sidebar-signin"
        >
          <LogIn className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 text-left">Sign in to create receipts</span>
          <ChevronRight className="w-3 h-3 opacity-60" />
        </button>
      )}

      {/* Foundation link */}
      <a
        href="https://www.aigovopsfoundation.org/"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
        data-testid="foundation-link"
      >
        <Shield className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        <span className="flex-1 text-white/70 text-[11px] font-medium">aigovopsfoundation.org</span>
        <ExternalLink className="w-3 h-3 text-white/30" />
      </a>

      {/* Donate */}
      <div className="rounded-lg border border-white/10 overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10">
          <Heart className="w-3 h-3 text-rose-400" />
          <span className="text-[11px] text-white/60 font-semibold uppercase tracking-wide">Support the mission</span>
        </div>
        <div className="flex gap-1.5 p-2">
          {[5, 10, 25].map(amount => (
            <a
              key={amount}
              href="https://www.aigovopsfoundation.org/"
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-md border border-white/15 bg-white/5 hover:bg-white/12 hover:border-emerald-500/40 transition-all cursor-pointer"
              data-testid={`donate-${amount}`}
            >
              <span className="text-emerald-400 font-bold text-xs">${amount}</span>
              <span className="text-white/35 text-[9px] uppercase tracking-wide">USD</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { mode, setMode } = useMode();
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
            <div className="text-white/50 text-[10px] leading-tight tracking-wide uppercase">REPLAY - BLACKBOX</div>
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

      <div className="border-t border-white/10 pt-3">
        <GuidePanel />
        <ModeToggle />
      </div>

      <div className="border-t border-white/10 pt-3">
        <FoundationPanel />
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

      <div className="border-t border-white/10 pt-3">
        <GuidePanel />
        <ModeToggle />
      </div>

      <div className="border-t border-white/10 pt-3">
        <FoundationPanel />
      </div>
    </>
  );

  const SidebarContent = isSimple ? SimpleSidebarContent : ExpertSidebarContent;

  return (
    <div className="flex h-screen w-full bg-background text-foreground">

      {/* Desktop sidebar — foundation navy */}
      <aside className="hidden md:flex w-60 flex-col h-full flex-shrink-0" style={{ background: "#1B3B6F" }}>
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 flex flex-col z-10" style={{ background: "#1B3B6F" }}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 flex-shrink-0">
                  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 2L4 7v9c0 6.6 5.1 12.8 12 14.3C22.9 28.8 28 22.6 28 16V7L16 2z" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="1.5"/>
                    <path d="M12 16l3 3 5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="font-bold text-white text-sm">AIGovOps REPLAY - BLACKBOX</span>
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
              <div className="font-bold text-foreground text-sm leading-none">AIGovOps REPLAY - BLACKBOX</div>
              <div className="text-[9px] text-muted-foreground leading-none mt-0.5">AiGovOps Foundation</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Compact inline toggle for mobile header */}
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5" data-testid="mode-toggle">
              <button
                onClick={() => setMode("simple")}
                data-testid="mode-simple"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  mode === "simple"
                    ? "bg-white text-[#1B3B6F] shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                😊 Simple
              </button>
              <button
                onClick={() => setMode("expert")}
                data-testid="mode-expert"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  mode === "expert"
                    ? "bg-white text-[#1B3B6F] shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Gauge className="w-3 h-3" /> Expert
              </button>
            </div>
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
