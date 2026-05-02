import { useListPolicies, useUpdatePolicy, useDeletePolicy, getListPoliciesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useAdminAuth } from "@/context/adminAuth";
import { AdminLoginModal } from "@/components/AdminLoginModal";

function SeverityBadge({ severity }: { severity: "low" | "medium" | "high" | "critical" }) {
  const map = {
    low: "bg-blue-50 text-blue-700 border-blue-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    high: "bg-orange-50 text-orange-700 border-orange-200",
    critical: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${map[severity]}`} data-testid={`severity-badge-${severity}`}>
      {severity}
    </span>
  );
}

export default function PoliciesList() {
  const { isAuthenticated, isLoading: authLoading, recheckAuth } = useAdminAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useListPolicies();

  const togglePolicy = useUpdatePolicy({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPoliciesQueryKey() }),
      onError: () => void recheckAuth(),
    },
  });

  const deletePolicy = useDeletePolicy({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPoliciesQueryKey() }),
      onError: () => void recheckAuth(),
    },
  });

  return (
    <div className="space-y-6" data-testid="policies-list-page">
      {!authLoading && isAuthenticated === false && (
        <AdminLoginModal onSuccess={() => void recheckAuth()} />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#1B3B6F" }}>
            <ShieldAlert className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Policies</h1>
            {data && <p className="text-sm text-muted-foreground">{data.total} governance rules</p>}
          </div>
        </div>
        <Link href="/policies/new">
          <Button size="sm" className="gap-2 font-semibold" data-testid="button-new-policy">
            <Plus className="w-4 h-4" />New Policy
          </Button>
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Policy-as-code rules enforced on every receipt. Violations are captured and visible in the receipt detail — moving from PDF theatre to executable evidence.
      </p>

      <div className="space-y-3" data-testid="policies-table">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
          : data?.items?.map((policy) => (
            <div key={policy.id} className={`bg-card border rounded-lg p-4 transition-all ${policy.enabled ? "border-border" : "border-border/50 opacity-60"}`} data-testid={`policy-row-${policy.id}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                    <span className="text-sm text-foreground font-semibold" data-testid={`policy-name-${policy.id}`}>{policy.name}</span>
                    <SeverityBadge severity={policy.severity} />
                    {policy.violationCount > 0 && (
                      <span className="text-[10px] text-red-700 border border-red-200 bg-red-50 px-2 py-0.5 rounded-full font-semibold">
                        {policy.violationCount} violation{policy.violationCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">{policy.description}</div>
                  <div className="bg-muted border border-border rounded-md px-3 py-1.5 text-sm font-mono text-muted-foreground truncate">
                    <span className="text-xs text-muted-foreground/60 uppercase tracking-wide font-semibold mr-2 not-mono">Rule:</span>
                    {policy.rule}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePolicy.mutate({ id: policy.id, data: { enabled: !policy.enabled } })}
                    className={`gap-1.5 text-sm font-semibold h-8 px-3 ${policy.enabled ? "text-emerald-600 hover:text-emerald-700" : "text-muted-foreground"}`}
                    data-testid={`button-toggle-policy-${policy.id}`}
                  >
                    {policy.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {policy.enabled ? "On" : "Off"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePolicy.mutate({ id: policy.id })}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                    data-testid={`button-delete-policy-${policy.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

        {!isLoading && !data?.items?.length && (
          <div className="text-muted-foreground text-sm p-10 border-2 border-dashed border-border rounded-lg text-center">
            No policies defined.{" "}
            <Link href="/policies/new">
              <span className="text-primary cursor-pointer hover:underline font-semibold">Create your first rule.</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
