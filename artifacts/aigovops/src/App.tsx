import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { ThemeProvider } from "./components/theme-provider";
import { Layout } from "./components/layout";

// Pages
import Dashboard from "./pages/dashboard";
import ReceiptsList from "./pages/receipts/list";
import ReceiptDetail from "./pages/receipts/detail";
import SubmitReceipt from "./pages/receipts/new";
import ChainView from "./pages/chain";
import PoliciesList from "./pages/policies/list";
import CreatePolicy from "./pages/policies/new";
import VerifyReceipt from "./pages/verify";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/receipts" component={ReceiptsList} />
        <Route path="/receipts/new" component={SubmitReceipt} />
        <Route path="/receipts/:id" component={ReceiptDetail} />
        <Route path="/chain" component={ChainView} />
        <Route path="/policies" component={PoliciesList} />
        <Route path="/policies/new" component={CreatePolicy} />
        <Route path="/verify" component={VerifyReceipt} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="aigovops-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
