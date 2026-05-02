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
            <CheckCircle2 className="w-16 h-16 text-emerald-400 animate-in zoom-in duration-300" />
          </div>
          <h2 className="text-xl font-bold font-mono text-foreground">RECEIPT MINTED</h2>
          <p className="text-sm text-muted-foreground font-mono">Cryptographic receipt has been sealed and added to the chain.</p>
        </div>
        <div className="bg-card border border-emerald-500/30 rounded-md p-4 font-mono text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">RECEIPT ID</span>
            <span className="text-foreground truncate max-w-[60%]" data-testid="minted-receipt-id">{minted.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">CHAIN HASH</span>
            <span className="text-primary truncate max-w-[60%]" data-testid="minted-chain-hash">{minted.chainHash.slice(0, 32)}…</span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button className="flex-1 font-mono text-xs" onClick={() => setLocation(`/receipts/${minted.id}`)} data-testid="button-view-receipt">
            VIEW RECEIPT
          </Button>
          <Button variant="outline" className="flex-1 font-mono text-xs" onClick={() => { setMinted(null); form.reset(); }} data-testid="button-mint-another">
            MINT ANOTHER
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6" data-testid="submit-receipt-page">
      <div className="flex items-center gap-2 mb-2">
        <Stamp className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold font-mono text-foreground">Mint Receipt</h1>
      </div>
      <p className="text-sm text-muted-foreground font-mono">Submit an AI interaction to create a cryptographically signed, hash-chained receipt.</p>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="prompt"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Prompt</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={4} placeholder="Enter the AI prompt..." className="font-mono text-sm resize-none" data-testid="input-prompt" />
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
                <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Response</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={6} placeholder="Paste the AI response..." className="font-mono text-sm resize-none" data-testid="input-response" />
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
                  <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Model</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="gpt-4o, claude-3-5..." className="font-mono text-sm" data-testid="input-model" />
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
                  <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">User ID</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="user-001" className="font-mono text-sm" data-testid="input-user-id" />
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
                <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Tags (comma-separated)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="production, legal, high-risk" className="font-mono text-sm" data-testid="input-tags" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={minting} className="w-full font-mono text-xs gap-2" data-testid="button-submit-receipt">
            {minting ? <><Loader2 className="w-3 h-3 animate-spin" />MINTING RECEIPT…</> : <><Stamp className="w-3 h-3" />MINT RECEIPT</>}
          </Button>
        </form>
      </Form>
    </div>
  );
}
