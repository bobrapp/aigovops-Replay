import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ThemeProvider } from "./components/theme-provider";
import { Layout } from "./components/layout";
import { ModeProvider, useMode } from "./context/mode";

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

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="aigovops-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ModeProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </ModeProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
