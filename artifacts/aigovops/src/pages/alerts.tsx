import { useState } from "react";
import {
  useListWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useListWebhookDeliveries,
  getListWebhooksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell, Plus, Trash2, Play, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, ToggleLeft, ToggleRight,
  Loader2, Shield, Mail
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ── Status badges ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "pending" | "delivered" | "failed" }) {
  if (status === "delivered") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
        <CheckCircle className="w-3 h-3" />
        delivered
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-semibold">
        <XCircle className="w-3 h-3" />
        failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
      <Clock className="w-3 h-3" />
      pending
    </span>
  );
}

function FilterBadge({ filter }: { filter: string }) {
  const labels: Record<string, { label: string; cls: string }> = {
    all: { label: "All violations", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    critical: { label: "Critical only", cls: "bg-red-50 text-red-700 border-red-200" },
    high_and_critical: { label: "High + Critical", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  };
  const { label, cls } = labels[filter] ?? labels["all"]!;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ── Delivery list for a single endpoint ──────────────────────────────────────

function DeliveryList({ endpointId }: { endpointId: string }) {
  const { data, isLoading } = useListWebhookDeliveries(endpointId);

  if (isLoading) {
    return (
      <div className="space-y-2 pt-2">
        {[1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (!data?.items.length) {
    return (
      <p className="text-xs text-muted-foreground py-3 text-center">
        No deliveries yet — violations will appear here once minted.
      </p>
    );
  }

  return (
    <div className="space-y-1.5 pt-2" data-testid="delivery-list">
      {data.items.map((d) => (
        <div
          key={d.id}
          className="flex items-center justify-between text-xs rounded-lg px-3 py-2 bg-muted/50 gap-3"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <StatusBadge status={d.status} />
            <span className="text-muted-foreground truncate font-mono text-[10px]">
              Receipt: {d.receiptId.slice(0, 16)}…
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
            {d.responseCode != null && (
              <span className={`font-mono font-semibold ${d.responseCode >= 200 && d.responseCode < 300 ? "text-emerald-600" : "text-red-500"}`}>
                {d.responseCode}
              </span>
            )}
            <span>attempt {d.attempts}</span>
            <span>{new Date(d.createdAt).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Test result indicator ─────────────────────────────────────────────────────

interface TestResult {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
}

function TestResultChip({ result }: { result: TestResult }) {
  if (result.ok) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold">
        <CheckCircle className="w-3.5 h-3.5" />
        {result.statusCode} OK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-500 font-semibold">
      <XCircle className="w-3.5 h-3.5" />
      {result.error ?? `HTTP ${result.statusCode}`}
    </span>
  );
}

// ── Single webhook endpoint card ──────────────────────────────────────────────

interface EndpointCardProps {
  ep: {
    id: string;
    url: string;
    hasSecret: boolean;
    enabled: boolean;
    eventFilter: string;
    emailAlerts: boolean;
    policyIds?: string[] | null;
    createdAt: string;
  };
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  testLoading: boolean;
  testResult: TestResult | null;
  deleteLoading: boolean;
}

function EndpointCard({
  ep, onToggle, onDelete, onTest, testLoading, testResult, deleteLoading
}: EndpointCardProps) {
  const [deliveriesOpen, setDeliveriesOpen] = useState(false);

  return (
    <Card className={`transition-opacity ${ep.enabled ? "" : "opacity-60"}`} data-testid="webhook-endpoint-card">
      <CardContent className="pt-4 pb-3 space-y-3">
        {/* URL + actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-medium truncate text-foreground" title={ep.url}>
              {ep.url}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Added {new Date(ep.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onToggle(ep.id, !ep.enabled)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors"
              title={ep.enabled ? "Disable" : "Enable"}
              data-testid="webhook-toggle-btn"
            >
              {ep.enabled
                ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                : <ToggleLeft className="w-5 h-5 text-muted-foreground" />
              }
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onTest(ep.id)}
              disabled={testLoading || !ep.enabled}
              className="h-7 gap-1.5 text-xs"
              data-testid="webhook-test-btn"
            >
              {testLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Test
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(ep.id)}
              disabled={deleteLoading}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
              data-testid="webhook-delete-btn"
            >
              {deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Badges row */}
        <div className="flex items-center gap-2 flex-wrap">
          <FilterBadge filter={ep.eventFilter} />
          {ep.policyIds && ep.policyIds.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold">
              {ep.policyIds.length} specific {ep.policyIds.length === 1 ? "policy" : "policies"}
            </span>
          )}
          {ep.hasSecret && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200 font-semibold">
              HMAC signed
            </span>
          )}
          {ep.emailAlerts && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-sky-50 text-sky-700 border-sky-200 font-semibold">
              <Mail className="w-2.5 h-2.5" />
              email alerts
            </span>
          )}
          {!ep.enabled && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-muted text-muted-foreground font-semibold">
              disabled
            </span>
          )}
        </div>

        {/* Test result */}
        {testResult && (
          <div className="text-xs px-3 py-1.5 rounded-lg bg-muted/50 flex items-center gap-2">
            <span className="text-muted-foreground">Test result:</span>
            <TestResultChip result={testResult} />
          </div>
        )}

        {/* Deliveries toggle */}
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
          onClick={() => setDeliveriesOpen((o) => !o)}
        >
          {deliveriesOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Recent deliveries
        </button>

        {deliveriesOpen && <DeliveryList endpointId={ep.id} />}
      </CardContent>
    </Card>
  );
}

// ── Add endpoint form ─────────────────────────────────────────────────────────

function AddEndpointForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [eventFilter, setEventFilter] = useState<"all" | "critical" | "high_and_critical">("all");
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [policyIdsRaw, setPolicyIdsRaw] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const create = useCreateWebhook({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWebhooksQueryKey() });
        onClose();
      },
      onError: (e: unknown) => {
        const msg = (e as { payload?: { error?: string } })?.payload?.error;
        setErr(msg ?? "Failed to create webhook endpoint.");
      },
    },
  });

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    if (!url.trim()) { setErr("URL is required."); return; }
    const policyIds = policyIdsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    create.mutate({
      data: {
        url: url.trim(),
        secret: secret.trim() || undefined,
        eventFilter,
        emailAlerts,
        policyIds: policyIds.length > 0 ? policyIds : undefined,
      },
    });
  }

  return (
    <Card data-testid="add-webhook-form">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Add Webhook Endpoint</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1">
              Endpoint URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-server.example.com/hooks/policy-violations"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
              data-testid="webhook-url-input"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must be a public HTTPS URL. Private IP ranges are blocked.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1">
              HMAC Secret <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="your-hmac-secret"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              data-testid="webhook-secret-input"
            />
            <p className="text-xs text-muted-foreground mt-1">
              When set, every delivery includes <code className="text-[10px] bg-muted px-1 rounded">X-AIGovOps-Signature: sha256=&lt;hmac&gt;</code> for authenticity verification.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1">Event filter</label>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value as typeof eventFilter)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="webhook-filter-select"
            >
              <option value="all">All violations</option>
              <option value="high_and_critical">High + Critical only</option>
              <option value="critical">Critical only</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1">
              Specific policy IDs <span className="text-muted-foreground font-normal">(optional — overrides filter above)</span>
            </label>
            <input
              type="text"
              value={policyIdsRaw}
              onChange={(e) => setPolicyIdsRaw(e.target.value)}
              placeholder="policyId1, policyId2, ..."
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              data-testid="webhook-policy-ids-input"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Comma-separated. When set, only violations against these exact policies trigger delivery, regardless of severity filter.
            </p>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Mail className="w-4 h-4 shrink-0" />
            <span>Email alerts for critical violations — coming soon in a future update.</span>
          </div>

          {err && (
            <p className="text-sm text-red-500 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" />
              {err}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="submit"
              size="sm"
              className="gap-2"
              disabled={create.isPending}
              data-testid="webhook-save-btn"
            >
              {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Save Endpoint
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useListWebhooks();

  const updateWebhook = useUpdateWebhook({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListWebhooksQueryKey() }),
    },
  });

  const deleteWebhook = useDeleteWebhook({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListWebhooksQueryKey() });
        setDeletingId(null);
      },
      onSettled: () => setDeletingId(null),
    },
  });

  const testWebhook = useTestWebhook({
    mutation: {
      onSuccess: (result, vars) => {
        const id = vars.id;
        const normalized: TestResult = {
          ok: result.ok,
          statusCode: result.statusCode ?? null,
          error: result.error ?? null,
        };
        setTestResults((prev) => ({ ...prev, [id]: normalized }));
        setTestingId(null);
      },
      onError: (_, vars) => {
        setTestResults((prev) => ({
          ...prev,
          [vars.id]: { ok: false, statusCode: null, error: "Request failed" },
        }));
        setTestingId(null);
      },
    },
  });

  function handleToggle(id: string, enabled: boolean) {
    updateWebhook.mutate({ id, data: { enabled } });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this webhook endpoint and all its delivery records?")) return;
    setDeletingId(id);
    deleteWebhook.mutate({ id });
  }

  function handleTest(id: string) {
    setTestingId(id);
    testWebhook.mutate({ id });
  }

  return (
    <div className="space-y-6 max-w-3xl" data-testid="alerts-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#1B3B6F" }}>
            <Bell className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Alerts</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? "Loading…" : `${data?.total ?? 0} webhook endpoint${data?.total === 1 ? "" : "s"} configured`}
            </p>
          </div>
        </div>
        {!showAddForm && (
          <Button
            size="sm"
            className="gap-2 font-semibold"
            onClick={() => setShowAddForm(true)}
            data-testid="btn-add-webhook"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Endpoint
          </Button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && <AddEndpointForm onClose={() => setShowAddForm(false)} />}

      {/* Endpoint list */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : data?.items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <Shield className="w-7 h-7" style={{ color: "#10b981" }} />
            </div>
            <div>
              <p className="font-semibold text-foreground">No webhook endpoints yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Add an endpoint to receive real-time HTTP notifications whenever a minted receipt triggers a policy violation.
              </p>
            </div>
            <Button
              size="sm"
              className="gap-2 font-semibold"
              onClick={() => setShowAddForm(true)}
              data-testid="btn-add-webhook-empty"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Your First Endpoint
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data?.items.map((ep) => (
            <EndpointCard
              key={ep.id}
              ep={ep}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onTest={handleTest}
              testLoading={testingId === ep.id}
              testResult={testResults[ep.id] ?? null}
              deleteLoading={deletingId === ep.id}
            />
          ))}
        </div>
      )}

      {/* Info box */}
      <Card className="border-dashed">
        <CardContent className="py-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">How webhooks work</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>When a receipt is minted and one or more policy rules fail, a POST is sent to each enabled endpoint.</li>
            <li>The JSON payload includes <code className="bg-muted px-1 rounded text-[10px]">event</code>, <code className="bg-muted px-1 rounded text-[10px]">receiptId</code>, <code className="bg-muted px-1 rounded text-[10px]">violations</code>, <code className="bg-muted px-1 rounded text-[10px]">summary</code>, and <code className="bg-muted px-1 rounded text-[10px]">timestamp</code>.</li>
            <li>Failed deliveries are retried up to 3 times (5 s → 25 s → 125 s backoff), then permanently failed.</li>
            <li>If an HMAC secret is configured, each delivery is signed via <code className="bg-muted px-1 rounded text-[10px]">X-AIGovOps-Signature: sha256=…</code></li>
            <li>Use the "Test" button to send a synthetic event without minting a real receipt.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
