/**
 * pages/demo-chain.tsx
 *
 * Public, no-login full-page view of the shared demo chain. Linked to from
 * the BYOAI mint result panel ("See it on the chain"). Mounted in App.tsx as
 * a public route — must come BEFORE the <AuthGate> wrapper so anonymous
 * visitors can reach it.
 */
import { Link } from "wouter";
import { ArrowLeft, Shield } from "lucide-react";
import { DemoGallery } from "../components/demo-gallery";
import { ByoaiMintForm } from "../components/byoai-mint-form";

export default function DemoChainPage() {
  return (
    <div
      className="min-h-screen px-6 lg:px-12 py-10"
      style={{ background: "#060d1a", color: "white" }}
    >
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ color: "rgba(255,255,255,0.55)" }}
            data-testid="link-home"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to landing
          </Link>
          <div
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded"
            style={{
              background: "rgba(16,185,129,0.12)",
              color: "#6ee7b7",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            <Shield className="w-3 h-3" />
            Public Demo Chain
          </div>
        </div>

        {/* Title */}
        <div className="space-y-3">
          <h1
            className="text-3xl lg:text-4xl font-black leading-tight"
            style={{ fontFamily: "'Satoshi', system-ui, sans-serif", letterSpacing: "-0.02em" }}
          >
            The public demo chain
          </h1>
          <p className="text-sm leading-relaxed text-white/60 max-w-2xl">
            Every receipt below is real — cryptographically signed and chained.
            The first batch was seeded at server boot to span legal, medical,
            finance, governance and policy-violation scenarios. Anything below
            those was minted by other visitors using "bring your own AI output"
            on the landing page.
          </p>
        </div>

        {/* Two-column: gallery left, mint form right */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
          <div className="space-y-4">
            <h2
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}
            >
              Latest receipts
            </h2>
            <DemoGallery compact />
          </div>
          <div className="space-y-4">
            <h2
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}
            >
              Mint your own
            </h2>
            <ByoaiMintForm />
            <p className="text-[10px] leading-relaxed text-white/35">
              No live LLM call is made. The server hashes the prompt + response
              you supply, links it to the previous chain entry, and returns the
              receipt. Per-IP rate limit: 3 mints per hour.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
