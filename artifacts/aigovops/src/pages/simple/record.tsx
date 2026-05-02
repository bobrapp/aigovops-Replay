import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateInteraction,
  getListInteractionsQueryKey,
  getGetStatsQueryKey,
  getGetChainQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Form, FormField, FormItem, FormControl, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, ChevronRight, ChevronLeft, Mic } from "lucide-react";

const formSchema = z.object({
  prompt: z.string().min(1, "Please enter what you asked the AI"),
  response: z.string().min(1, "Please paste what the AI said back"),
  model: z.string().min(1, "Please enter the AI tool name"),
  userId: z.string().min(1, "Please enter your name or ID"),
  tags: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const STEPS = [
  { id: "prompt", title: "What did you ask?", subtitle: "Paste or type what you sent to the AI" },
  { id: "response", title: "What did it say?", subtitle: "Paste the AI's reply here" },
  { id: "details", title: "A little more info", subtitle: "Just two quick details to finish up" },
];

const AI_TOOLS = ["ChatGPT", "Claude", "Gemini", "Copilot", "Other"];

export default function SimpleRecord() {
  const [step, setStep] = useState(0);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [minted, setMinted] = useState<{ id: string } | null>(null);
  const [minting, setMinting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { prompt: "", response: "", model: "ChatGPT", userId: "", tags: "" },
  });

  const createInteraction = useCreateInteraction({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListInteractionsQueryKey({}) });
        queryClient.invalidateQueries({ queryKey: getGetStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetChainQueryKey() });
        setMinted({ id: data.id });
        setMinting(false);
      },
      onError: () => setMinting(false),
    },
  });

  async function goNext() {
    const stepFields: (keyof FormValues)[][] = [["prompt"], ["response"], ["model", "userId"]];
    const fields = stepFields[step];
    const ok = await form.trigger(fields);
    if (ok) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

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
      <div className="max-w-sm mx-auto text-center space-y-6 pt-8" data-testid="simple-record-success">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">Saved!</h2>
          <p className="text-muted-foreground mt-2">
            Your chat has been safely recorded and protected.
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-left space-y-1">
          <div className="text-xs text-muted-foreground">Recording ID</div>
          <div className="text-sm font-mono text-foreground break-all">{minted.id}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => setLocation(`/receipts/${minted.id}`)}
          >
            View Details
          </Button>
          <Button
            className="rounded-xl"
            onClick={() => { setMinted(null); form.reset(); setStep(0); }}
          >
            Record Another
          </Button>
        </div>
      </div>
    );
  }

  const currentStep = STEPS[step];

  return (
    <div className="max-w-sm mx-auto space-y-6 pt-2" data-testid="simple-record-page">
      {/* Header */}
      <div className="text-center space-y-1">
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Mic className="w-6 h-6 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Record a Chat</h1>
        <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all ${
              i === step ? "w-6 bg-primary" : i < step ? "w-2 bg-primary/50" : "w-2 bg-border"
            }`}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">{currentStep.title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{currentStep.subtitle}</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {step === 0 && (
              <FormField
                control={form.control}
                name="prompt"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={5}
                        placeholder="e.g. Write me a summary of this legal contract..."
                        className="rounded-xl text-sm resize-none"
                        data-testid="simple-input-prompt"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {step === 1 && (
              <FormField
                control={form.control}
                name="response"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={6}
                        placeholder="Paste the AI's full response here..."
                        className="rounded-xl text-sm resize-none"
                        data-testid="simple-input-response"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Which AI tool did you use?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {AI_TOOLS.map((tool) => (
                      <button
                        key={tool}
                        type="button"
                        onClick={() => form.setValue("model", tool)}
                        className={`rounded-xl border py-2.5 text-sm font-medium transition-all ${
                          form.watch("model") === tool
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:border-primary/40"
                        }`}
                        data-testid={`simple-model-${tool.toLowerCase()}`}
                      >
                        {tool}
                      </button>
                    ))}
                  </div>
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem className="mt-2">
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Or type any AI name..."
                            className="rounded-xl text-sm"
                            data-testid="simple-input-model"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="userId"
                  render={({ field }) => (
                    <FormItem>
                      <label className="text-sm font-medium text-foreground mb-1.5 block">Your name or ID</label>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. Jane Smith or jane@company.com"
                          className="rounded-xl text-sm"
                          data-testid="simple-input-userid"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 pt-2">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-xl gap-2"
                  onClick={() => setStep((s) => s - 1)}
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button
                  type="button"
                  className="flex-1 rounded-xl gap-2"
                  onClick={goNext}
                  data-testid="simple-next-step"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={minting}
                  className="flex-1 rounded-xl gap-2"
                  data-testid="simple-submit-record"
                >
                  {minting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  ) : (
                    <>Save Recording ✓</>
                  )}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
