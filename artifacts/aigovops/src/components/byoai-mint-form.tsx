/**
 * byoai-mint-form.tsx
 *
 * "Bring Your Own AI Output" mint form for anonymous landing-page visitors.
 *
 * Visitor pastes a prompt + response from any AI tool (ChatGPT, Claude,
 * Gemini, Llama, etc.), picks the model, and submits. The server returns a
 * real cryptographically chained DemoReceipt. We show the receipt inline and
 * link to the full demo chain view.
 *
 * Hard caps mirror the server-side limits (lib/api-spec/openapi.yaml):
 *   - prompt   ≤ 2 048 chars
 *   - response ≤ 32 768 chars
 *   - model    ≤   100 chars
 *
 * Per-IP rate limit (3/hour) is enforced server-side; we surface a friendly
 * 429 message to the visitor and cap re-tries.
 */
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateDemoMint,
  getGetDemoChainQueryKey,
} from "@workspace/api-client-react";
import type { DemoReceipt } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Sparkles, ArrowRight, AlertTriangle, CheckCircle } from "lucide-react";

const PROMPT_MAX = 2048;
const RESPONSE_MAX = 32768;
const MODEL_OTHER = "__other__";

const MODEL_PRESETS: Array<{ value: string; label: string }> = [
  { value: "gpt-4o", label: "GPT-4o (OpenAI)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo (OpenAI)" },
  { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet (Anthropic)" },
  { value: "claude-3-opus", label: "Claude 3 Opus (Anthropic)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Google)" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro (Google)" },
  { value: "llama-3.1-70b", label: "Llama 3.1 70B (Meta)" },
  { value: "mistral-large", label: "Mistral Large" },
  { value: MODEL_OTHER, label: "Other / type your own" },
];

function shortHash(h: string): string {
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

export function ByoaiMintForm() {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [modelChoice, setModelChoice] = useState<string>("gpt-4o");
  const [modelOther, setModelOther] = useState<string>("");
  const [result, setResult] = useState<DemoReceipt | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useCreateDemoMint();

  const finalModel =
    modelChoice === MODEL_OTHER ? modelOther.trim() : modelChoice;

  function validate(): string | null {
    if (!prompt.trim()) return "Please paste the prompt you sent the AI.";
    if (!response.trim()) return "Please paste the AI's response.";
    if (prompt.length > PROMPT_MAX)
      return `Prompt is too long (${prompt.length} / ${PROMPT_MAX} chars).`;
    if (response.length > RESPONSE_MAX)
      return `Response is too long (${response.length} / ${RESPONSE_MAX} chars).`;
    if (!finalModel) return "Please pick or enter a model name.";
    if (finalModel.length > 100) return "Model name must be 100 characters or fewer.";
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const v = validate();
    if (v) {
      setErrorMsg(v);
      return;
    }

    try {
      const receipt = await mutation.mutateAsync({
        data: { prompt, response, model: finalModel },
      });
      setResult(receipt);
      // Refresh the public chain so the gallery picks up the new entry.
      queryClient.invalidateQueries({ queryKey: getGetDemoChainQueryKey() });
    } catch (err: unknown) {
      // The customFetch surfaces non-2xx responses with the status code in
      // the message; fall back to a generic message otherwise.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429")) {
        setErrorMsg(
          "You've hit the demo mint rate limit (3/hour per IP). Try again in an hour.",
        );
      } else if (msg.includes("400")) {
        setErrorMsg(
          "The server rejected this input. Make sure prompt and response are non-empty and within the size limits.",
        );
      } else {
        setErrorMsg(`Mint failed: ${msg}`);
      }
    }
  }

  function reset() {
    setPrompt("");
    setResponse("");
    setResult(null);
    setErrorMsg(null);
  }

  // After a successful mint, show the result panel instead of the form.
  if (result) {
    return (
      <div
        className="rounded-xl p-4 space-y-3"
        style={{
          background: "rgba(16,185,129,0.06)",
          border: "1px solid rgba(16,185,129,0.3)",
        }}
        data-testid="byoai-result"
      >
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4" style={{ color: "#10b981" }} />
          <span
            className="text-sm font-bold tracking-widest uppercase"
            style={{ color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Receipt Minted
          </span>
        </div>
        <div
          className="text-[10px] space-y-1"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          <div className="flex justify-between gap-2">
            <span className="text-white/40">CHAIN HASH</span>
            <span className="text-white/70 truncate" data-testid="byoai-result-chainhash">
              {shortHash(result.chainHash)}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-white/40">PREV HASH</span>
            <span className="text-white/70 truncate" data-testid="byoai-result-prevhash">
              {result.prevHash ? shortHash(result.prevHash) : "GENESIS"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-white/40">PROMPT HASH</span>
            <span className="text-white/70 truncate">{shortHash(result.promptHash)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-white/40">RESPONSE HASH</span>
            <span className="text-white/70 truncate">{shortHash(result.responseHash)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-white/40">MODEL</span>
            <span className="text-white/70 truncate">{result.model}</span>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Link
            href="/demo-chain"
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg py-2 transition-opacity hover:opacity-80"
            style={{
              background: "rgba(16,185,129,0.18)",
              color: "#a7f3d0",
              border: "1px solid rgba(16,185,129,0.4)",
            }}
            data-testid="link-view-chain"
          >
            See it on the chain
            <ArrowRight className="w-3 h-3" />
          </Link>
          <button
            onClick={reset}
            className="text-xs font-semibold rounded-lg px-3 py-2 transition-opacity hover:opacity-80"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            data-testid="btn-mint-another"
          >
            Mint another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl p-4 space-y-3"
      style={{
        background: "#0f1d33",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
      data-testid="byoai-form"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5" style={{ color: "#10b981" }} />
        <span
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}
        >
          Mint Your Own
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-white/45">
        Paste a prompt + response from any AI tool. We hash, chain, and sign it
        on the public demo chain — no login, no live LLM call.
      </p>

      <div className="space-y-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">
            Prompt
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={PROMPT_MAX}
            rows={3}
            placeholder="What did you ask the AI?"
            className="mt-1 w-full text-xs px-2.5 py-2 rounded-lg resize-none focus:outline-none"
            style={{
              background: "#060d1a",
              color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
            data-testid="input-prompt"
          />
          <span className="text-[9px] text-white/30 float-right mt-0.5">
            {prompt.length}/{PROMPT_MAX}
          </span>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">
            AI Response
          </span>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            maxLength={RESPONSE_MAX}
            rows={4}
            placeholder="Paste exactly what the AI replied."
            className="mt-1 w-full text-xs px-2.5 py-2 rounded-lg resize-none focus:outline-none"
            style={{
              background: "#060d1a",
              color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
            data-testid="input-response"
          />
          <span className="text-[9px] text-white/30 float-right mt-0.5">
            {response.length}/{RESPONSE_MAX}
          </span>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">
            Model
          </span>
          <select
            value={modelChoice}
            onChange={(e) => setModelChoice(e.target.value)}
            className="mt-1 w-full text-xs px-2.5 py-2 rounded-lg focus:outline-none"
            style={{
              background: "#060d1a",
              color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            data-testid="input-model"
          >
            {MODEL_PRESETS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          {modelChoice === MODEL_OTHER && (
            <input
              type="text"
              value={modelOther}
              onChange={(e) => setModelOther(e.target.value)}
              maxLength={100}
              placeholder="e.g. mistral-large-2407"
              className="mt-2 w-full text-xs px-2.5 py-2 rounded-lg focus:outline-none"
              style={{
                background: "#060d1a",
                color: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
              data-testid="input-model-other"
            />
          )}
        </label>
      </div>

      {errorMsg && (
        <div
          className="flex items-start gap-2 text-[11px] px-3 py-2 rounded-lg"
          style={{
            background: "rgba(239,68,68,0.08)",
            color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
          data-testid="byoai-error"
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: "linear-gradient(135deg, #10B981, #059669)",
          color: "white",
          fontFamily: "'Satoshi', system-ui, sans-serif",
        }}
        data-testid="btn-mint"
      >
        {mutation.isPending ? "Minting…" : "Mint receipt"}
      </button>
    </form>
  );
}
