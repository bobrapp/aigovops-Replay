import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ThemeProvider } from "./components/theme-provider";
import { Layout } from "./components/layout";
import { ModeProvider, useMode } from "./context/mode";
import { AdminAuthProvider } from "./context/adminAuth";
import { useAuth } from "@workspace/replit-auth-web";
import { Shield, Gauge, Sparkles, Lock, ChevronRight } from "lucide-react";

// Expert pages
import Dashboard from "./pages/dashboard";
import ReceiptsList from "./pages/receipts/list";
import ReceiptDetail from "./pages/receipts/detail";
import SubmitReceipt from "./pages/receipts/new";
import ChainView from "./pages/chain";
import PoliciesList from "./pages/policies/list";
import CreatePolicy from "./pages/policies/new";
import VerifyReceipt from "./pages/verify";
import DemoPage from "./pages/demo";
import SpecPage from "./pages/spec";
import AgentsPage from "./pages/agents";

// Simple pages
import SimpleHome from "./pages/simple/home";
import SimpleRecord from "./pages/simple/record";
import SimpleHistory from "./pages/simple/history";
import SimpleCheck from "./pages/simple/check";

const queryClient = new QueryClient();

function ShieldMascot({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="48" cy="48" r="46" fill="rgba(16,185,129,0.08)" />
      <circle cx="48" cy="48" r="36" fill="rgba(16,185,129,0.06)" />
      <path
        d="M48 8L14 22v22c0 19.8 15.4 38.4 34 42.4C65.6 82.4 82 63.8 82 44V22L48 8z"
        fill="url(#shield-gradient)" stroke="rgba(16,185,129,0.6)" strokeWidth="1.5"
      />
      <path
        d="M48 18L24 28.5v17c0 13.8 10.8 26.8 24 29.8 13.2-3 24-16 24-29.8v-17L48 18z"
        fill="rgba(16,185,129,0.12)"
      />
      <circle cx="38" cy="43" r="3.5" fill="#10B981" />
      <circle cx="58" cy="43" r="3.5" fill="#10B981" />
      <circle cx="39.5" cy="41.5" r="1.2" fill="rgba(255,255,255,0.6)" />
      <circle cx="59.5" cy="41.5" r="1.2" fill="rgba(255,255,255,0.6)" />
      <path d="M40 54 Q48 61 56 54" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <defs>
        <linearGradient id="shield-gradient" x1="48" y1="8" x2="48" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#0f2849" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function LoginScreen() {
  const { mode, setMode } = useMode();
  const { login } = useAuth();

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "linear-gradient(145deg, #0F172A 0%, #1B3B6F 55%, #0d3320 100%)" }}>

      {/* Left panel: mascot + value prop */}
      <div className="flex flex-col justify-center items-center lg:items-start px-8 lg:px-16 py-12 lg:py-0 lg:flex-1">
        <div className="max-w-md w-full">

          {/* Mascot + title */}
          <div className="flex items-center gap-5 mb-8">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 rounded-full blur-2xl opacity-30" style={{ background: "#10B981" }} />
              <ShieldMascot size={88} />
            </div>
            <div>
              <div className="text-2xl font-bold text-white tracking-tight leading-tight">AIGovOps</div>
              <div className="text-emerald-400 font-mono text-sm font-semibold tracking-widest">REPLAY</div>
              <div className="text-white/50 text-xs mt-1 leading-snug">AI Governance Foundation</div>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-3xl lg:text-4xl font-bold text-white leading-tight mb-3">
            Every AI interaction,<br />
            <span style={{ color: "#10B981" }}>cryptographically proven.</span>
          </h1>
          <p className="text-white/60 text-base leading-relaxed mb-8">
            AIGovOps REPLAY creates tamper-proof receipts for every AI conversation —
            so you can verify what was said, when, and by which model.
          </p>

          {/* Value bullets */}
          <div className="space-y-4">
            {[
              { icon: "🔐", title: "Signed receipts", body: "SHA-256 cryptographic proof for every AI interaction" },
              { icon: "⛓️", title: "Immutable chain", body: "Receipts link together — any tampering breaks the chain" },
              { icon: "📋", title: "Policy compliance", body: "Automated rules flag interactions that cross your boundaries" },
            ].map(item => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                <div>
                  <div className="text-white font-semibold text-sm">{item.title}</div>
                  <div className="text-white/50 text-xs leading-relaxed">{item.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel: mode selection + login */}
      <div className="flex flex-col justify-center px-8 lg:px-12 py-12 lg:w-[420px] lg:flex-shrink-0">
        <div className="w-full max-w-sm mx-auto">

          <div className="text-white font-semibold text-base mb-1">Choose your experience</div>
          <div className="text-white/50 text-xs mb-5 leading-snug">
            You can switch anytime from the sidebar.
          </div>

          {/* Mode cards */}
          <div className="space-y-3 mb-6">
            <button
              onClick={() => setMode("simple")}
              className={`w-full text-left rounded-xl p-4 border-2 transition-all ${
                mode === "simple"
                  ? "border-emerald-400 bg-emerald-400/10"
                  : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/8"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-lg ${mode === "simple" ? "bg-emerald-400/20" : "bg-white/10"}`}>
                  😊
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`font-bold text-sm ${mode === "simple" ? "text-emerald-300" : "text-white"}`}>Simple Mode</span>
                    {mode === "simple" && <span className="text-[10px] bg-emerald-400/20 text-emerald-300 px-1.5 py-0.5 rounded font-semibold">Selected</span>}
                  </div>
                  <div className="text-white/55 text-xs leading-relaxed">
                    Record AI chats and see your history. Perfect for journalists, researchers, and everyday users.
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode("expert")}
              className={`w-full text-left rounded-xl p-4 border-2 transition-all ${
                mode === "expert"
                  ? "border-blue-400 bg-blue-400/10"
                  : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/8"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${mode === "expert" ? "bg-blue-400/20" : "bg-white/10"}`}>
                  <Gauge className={`w-5 h-5 ${mode === "expert" ? "text-blue-300" : "text-white/60"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`font-bold text-sm ${mode === "expert" ? "text-blue-300" : "text-white"}`}>Expert Mode</span>
                    {mode === "expert" && <span className="text-[10px] bg-blue-400/20 text-blue-300 px-1.5 py-0.5 rounded font-semibold">Selected</span>}
                  </div>
                  <div className="text-white/55 text-xs leading-relaxed">
                    Full audit trail, cryptographic chain view, policy rules, and API access. Built for compliance teams and developers.
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Sign in */}
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-2.5 rounded-xl py-3.5 font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "white" }}
          >
            <Shield className="w-4 h-4" />
            Sign in with Replit
            <ChevronRight className="w-4 h-4 opacity-70" />
          </button>

          <div className="flex items-center gap-2 mt-4 justify-center">
            <Lock className="w-3 h-3 text-white/30" />
            <span className="text-white/30 text-[11px]">Secure sign-in via Replit OIDC</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Router() {
  const { mode } = useMode();
  const isSimple = mode === "simple";

  return (
    <Layout>
      <Switch>
        <Route path="/" component={isSimple ? SimpleHome : Dashboard} />
        <Route path="/record" component={SimpleRecord} />
        <Route path="/history" component={SimpleHistory} />
        <Route path="/check" component={SimpleCheck} />
        <Route path="/demo" component={DemoPage} />
        <Route path="/receipts" component={ReceiptsList} />
        <Route path="/receipts/new" component={SubmitReceipt} />
        <Route path="/receipts/:id" component={ReceiptDetail} />
        <Route path="/chain" component={ChainView} />
        <Route path="/agents" component={AgentsPage} />
        <Route path="/policies" component={PoliciesList} />
        <Route path="/policies/new" component={CreatePolicy} />
        <Route path="/verify" component={VerifyReceipt} />
        <Route path="/spec" component={SpecPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0F172A" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-emerald-400/30 border-t-emerald-400 animate-spin" />
          <div className="text-white/40 font-mono text-xs">Authenticating…</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="aigovops-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ModeProvider>
            <AdminAuthProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <AuthGate>
                  <Router />
                </AuthGate>
              </WouterRouter>
            </AdminAuthProvider>
          </ModeProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
