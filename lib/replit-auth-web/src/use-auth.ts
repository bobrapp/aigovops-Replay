import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/user", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    const returnTo = window.location.pathname || "/";
    window.location.href = `/api/login?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  const logout = useCallback(() => {
    // POST to prevent CSRF-forced logout via cross-site top-level GET navigation.
    // SameSite=Lax does not send cookies on cross-site POSTs, and the server's
    // same-origin guard enforces the Origin allowlist as a second layer.
    // The server returns { redirectUrl } pointing to the OIDC end-session URL;
    // we navigate there programmatically to complete the logout flow.
    fetch("/api/logout", { method: "POST", credentials: "include" })
      .then((res) => res.json() as Promise<{ redirectUrl?: string }>)
      .then((data) => {
        window.location.href = data.redirectUrl ?? "/";
      })
      .catch(() => {
        window.location.href = "/";
      });
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
