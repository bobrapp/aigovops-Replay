import { useState } from "react";
import { useAdminAuth } from "@/context/adminAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Loader2, Lock } from "lucide-react";

interface AdminLoginModalProps {
  onSuccess?: () => void;
}

export function AdminLoginModal({ onSuccess }: AdminLoginModalProps) {
  const { login } = useAdminAuth();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setError(null);
    setIsPending(true);
    const err = await login(token.trim());
    setIsPending(false);
    if (err) {
      setError(err);
    } else {
      setToken("");
      onSuccess?.();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "#1B3B6F" }}>
            <Lock className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Admin Access Required</h2>
            <p className="text-xs text-muted-foreground">Enter the admin token to manage policies.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Admin Token
            </label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter admin token"
              className="text-sm font-mono"
              autoFocus
              data-testid="input-admin-token"
            />
            {error && (
              <p className="text-xs text-red-600 font-medium" data-testid="admin-login-error">
                {error}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isPending || !token.trim()}
            className="w-full gap-2 font-semibold"
            data-testid="button-admin-login"
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Verifying…</>
            ) : (
              <><ShieldAlert className="w-4 h-4" />Unlock Policy Management</>
            )}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          Set the <code className="font-mono bg-muted px-1 rounded">ADMIN_API_KEY</code> environment variable on the server to configure this token.
        </p>
      </div>
    </div>
  );
}
