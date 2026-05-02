import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreatePolicy, getListPoliciesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, ChevronLeft, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useAdminAuth } from "@/context/adminAuth";
import { AdminLoginModal } from "@/components/AdminLoginModal";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  rule: z.string().min(1, "Rule expression is required"),
  severity: z.enum(["low", "medium", "high", "critical"]),
  enabled: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreatePolicy() {
  const { isAuthenticated, isLoading: authLoading, recheckAuth } = useAdminAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      rule: "",
      severity: "medium",
      enabled: true,
    },
  });

  const createPolicy = useCreatePolicy({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListPoliciesQueryKey() });
        setLocation("/policies");
      },
      onError: () => void recheckAuth(),
    },
  });

  function onSubmit(values: FormValues) {
    createPolicy.mutate({ data: values });
  }

  return (
    <div className="max-w-xl mx-auto space-y-6" data-testid="create-policy-page">
      {!authLoading && isAuthenticated === false && (
        <AdminLoginModal onSuccess={() => void recheckAuth()} />
      )}

      <div className="flex items-center gap-2 mb-2">
        <Link href="/policies">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground font-medium" data-testid="button-back-policies">
            <ChevronLeft className="w-4 h-4" />Policies
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#1B3B6F" }}>
          <ShieldAlert className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">New Policy Rule</h1>
          <p className="text-sm text-muted-foreground">Rules are evaluated against every new interaction receipt.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. No PII in Prompts" className="text-sm" data-testid="input-policy-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Description</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={2} placeholder="What does this policy check?" className="text-sm resize-none" data-testid="input-policy-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rule"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Rule Expression</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder={`e.g. prompt.length < 4096 && !prompt.includes('password')`}
                    className="font-mono text-sm resize-none"
                    data-testid="input-policy-rule"
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Allowed variables: <code className="font-mono">prompt</code>, <code className="font-mono">response</code>, <code className="font-mono">model</code>, <code className="font-mono">userId</code>.
                  Supports: comparisons, <code className="font-mono">&amp;&amp;</code>, <code className="font-mono">||</code>, <code className="font-mono">!</code>, <code className="font-mono">typeof</code>, and string methods like <code className="font-mono">.includes()</code>, <code className="font-mono">.length</code>.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="severity"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Severity</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="text-sm" data-testid="select-policy-severity">
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={createPolicy.isPending} className="w-full gap-2 font-semibold" data-testid="button-create-policy">
            {createPolicy.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating…</> : <><ShieldAlert className="w-4 h-4" />Create Policy</>}
          </Button>
        </form>
      </Form>
    </div>
  );
}
