import { useListPolicies, useUpdatePolicy, useDeletePolicy, getListPoliciesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

function SeverityBadge({ severity }: { severity: "low" | "medium" | "high" | "critical" }) {
  const map = {
    low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    critical: "bg-red-500/10 text-red-400 border-red-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-mono uppercase tracking-wide ${map[severity]}`} data-testid={`severity-badge-${severity}`}>
      {severity}
    </span>
  );
}

export default function PoliciesList() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListPolicies();

  const togglePolicy = useUpdatePolicy({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPoliciesQueryKey() }),
    },
  });

  const deletePolicy = useDeletePolicy({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPoliciesQueryKey() }),
    },
  });

  return (
    <div className="space-y-6" data-testid="policies-list-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold font-mono text-foreground">Policies</h1>
          {data && <span className="text-xs text-muted-foreground font-mono">({data.total} rules)</span>}
        </div>
        <Link href="/policies/new">
          <Button size="sm" className="font-mono text-xs gap-2" data-testid="button-new-policy">
            <Plus className="w-3 h-3" />NEW POLICY
          </Button>
        </Link>
      </div>

      <p className="text-xs text-muted-foreground font-mono">Policy-as-code rules enforced on every interaction receipt. Violations are captured and visible in the receipt detail.</p>

      <div className="space-y-3" data-testid="policies-table">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          : data?.items?.map((policy) => (
            <div key={policy.id} className={`bg-card border rounded-md p-4 font-mono text-xs transition-colors ${policy.enabled ? "border-border" : "border-border/50 opacity-60"}`} data-testid={`policy-row-${policy.id}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-foreground font-semibold" data-testid={`policy-name-${policy.id}`}>{policy.name}</span>
                    <SeverityBadge severity={policy.severity} />
                    {policy.violationCount > 0 && (
                      <span className="text-[10px] text-red-400 border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 rounded">
                        {policy.violationCount} VIOLATIONS
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground mb-2">{policy.description}</div>
                  <div className="bg-background border border-border rounded px-2 py-1 text-foreground/80 text-[10px] truncate">
                    <span className="text-muted-foreground mr-2">RULE:</span>{policy.rule}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePolicy.mutate({ id: policy.id, data: { enabled: !policy.enabled } })}
                    className={`gap-1 text-xs font-mono h-7 px-2 ${policy.enabled ? "text-emerald-400 hover:text-emerald-300" : "text-muted-foreground"}`}
                    data-testid={`button-toggle-policy-${policy.id}`}
                  >
                    {policy.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {policy.enabled ? "ON" : "OFF"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePolicy.mutate({ id: policy.id })}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                    data-testid={`button-delete-policy-${policy.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}

        {!isLoading && !data?.items?.length && (
          <div className="text-muted-foreground text-xs font-mono p-8 border border-dashed border-border rounded-md text-center">
            No policies defined.{" "}
            <Link href="/policies/new">
              <span className="text-primary cursor-pointer hover:underline">Create your first rule.</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
