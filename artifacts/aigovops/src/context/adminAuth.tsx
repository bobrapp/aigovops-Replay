import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface AdminAuthState {
  isAuthenticated: boolean | null;
  isLoading: boolean;
  login: (token: string) => Promise<string | null>;
  logout: () => Promise<void>;
  recheckAuth: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const recheckAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/status", { credentials: "include" });
      setIsAuthenticated(res.ok);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void recheckAuth();
  }, [recheckAuth]);

  const login = useCallback(async (token: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setIsAuthenticated(true);
        return null;
      }
      const body = (await res.json()) as { error?: string };
      return body.error ?? "Login failed";
    } catch {
      return "Network error — please try again";
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setIsAuthenticated(false);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, recheckAuth }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthState {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return ctx;
}
