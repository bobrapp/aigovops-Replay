import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ThemeProvider } from "./components/theme-provider";
import { Layout } from "./components/layout";
import { ModeProvider, useMode } from "./context/mode";
import { useAuth } from "@workspace/replit-auth-web";

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

// Simple pages
import SimpleHome from "./pages/simple/home";
import SimpleRecord from "./pages/simple/record";
import SimpleHistory from "./pages/simple/history";
import SimpleCheck from "./pages/simple/check";

const queryClient = new QueryClient();

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
  const { isLoading, isAuthenticated, login } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground font-mono text-xs animate-pulse">AUTHENTICATING…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm mx-auto p-8">
          <div className="text-lg font-bold font-mono text-foreground">AIGovOps REPLAY</div>
          <p className="text-sm text-muted-foreground font-mono">Sign in to access the governance dashboard.</p>
          <button
            onClick={login}
            className="w-full bg-primary text-primary-foreground rounded px-4 py-2.5 text-sm font-mono font-bold hover:bg-primary/90 transition-colors"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="aigovops-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ModeProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AuthGate>
                <Router />
              </AuthGate>
            </WouterRouter>
          </ModeProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
