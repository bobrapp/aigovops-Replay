import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateInteraction, getListInteractionsQueryKey, getGetStatsQueryKey, getGetChainQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Stamp, Loader2 } from "lucide-react";

const formSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  response: z.string().min(1, "Response is required"),
  model: z.string().min(1, "Model name is required"),
  userId: z.string().min(1, "User ID is required"),
  tags: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

export default function SubmitReceipt() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [minted, setMinted] = useState<{ id: string; chainHash: string } | null>(null);
  const [minting, setMinting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      prompt: "",
      response: "",
      model: "gpt-4o",
      userId: "user-001",
      tags: "",
    },
  });

  const createInteraction = useCreateInteraction({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListInteractionsQueryKey({}) });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetChainQueryKey() });
        setMinted({ id: data.id, chainHash: data.chainHash });
        setMinting(false);
      },
      onError: () => setMinting(false),
    },
  });

  function onSubmit(values: FormValues) {
    setMinting(true);
    createInteraction.mutate({
      data: {
        prompt: values.prompt,
        response: values.response,
        model: values.model,
        userId: values.userId,
        tags: values.tags ? values.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      },
    });
  }

  if (minted) {
    return (
      <div className="max-w-lg mx-auto space-y-6" data-testid="receipt-minted-success">
        <div className="text-center space-y-4 py-8">
          <div className="flex justify-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 animate-in zoom-in duration-300" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Receipt Minted</h2>
          <p className="text-muted-foreground">Cryptographic receipt sealed and added to the chain.</p>
        </div>
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Receipt ID</span>
            <span className="text-sm text-foreground font-mono truncate max-w-[60%]" data-testid="minted-receipt-id">{minted.id}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Chain Hash</span>
            <span className="text-sm text-primary font-mono truncate max-w-[60%]" data-testid="minted-chain-hash">{minted.chainHash.slice(0, 32)}…</span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button className="flex-1 gap-2 font-semibold" onClick={() => setLocation(`/receipts/${minted.id}`)} data-testid="button-view-receipt">
            View Receipt
          </Button>
          <Button variant="outline" className="flex-1 font-semibold" onClick={() => { setMinted(null); form.reset(); }} data-testid="button-mint-another">
            Mint Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6" data-testid="submit-receipt-page">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#1B3B6F" }}>
          <Stamp className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Mint Receipt</h1>
          <p className="text-sm text-muted-foreground">Submit an AI interaction to create a cryptographically signed, hash-chained receipt.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="prompt"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Prompt</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={4} placeholder="Enter the AI prompt..." className="text-sm resize-none" data-testid="input-prompt" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="response"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Response</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={6} placeholder="Paste the AI response..." className="text-sm resize-none" data-testid="input-response" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Model</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="gpt-4o, claude-3-5..." className="text-sm" data-testid="input-model" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">User ID</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="user-001" className="text-sm" data-testid="input-user-id" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tags (comma-separated)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="production, legal, high-risk" className="text-sm" data-testid="input-tags" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={minting} className="w-full gap-2 font-semibold" data-testid="button-submit-receipt">
            {minting ? <><Loader2 className="w-4 h-4 animate-spin" />Minting Receipt…</> : <><Stamp className="w-4 h-4" />Mint Receipt</>}
          </Button>
        </form>
      </Form>
    </div>
  );
}
