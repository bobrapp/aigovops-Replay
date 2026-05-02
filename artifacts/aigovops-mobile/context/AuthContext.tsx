import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

WebBrowser.maybeCompleteAuthSession();

const STORAGE_KEY = "aigovops_session_token";
const REPL_ID = process.env.EXPO_PUBLIC_REPL_ID ?? "";
const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const ISSUER = "https://replit.com/oidc";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const discovery = AuthSession.useAutoDiscovery(ISSUER);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: "aigovops-mobile" });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: REPL_ID,
      redirectUri,
      scopes: ["openid", "email", "profile", "offline_access"],
      usePKCE: true,
      prompt: AuthSession.Prompt.Login,
    },
    discovery,
  );

  const apiBase = `https://${DOMAIN}`;

  async function fetchUser(sid: string): Promise<AuthUser | null> {
    try {
      const res = await fetch(`${apiBase}/api/auth/user`, {
        headers: { Authorization: `Bearer ${sid}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user ?? null;
    } catch {
      return null;
    }
  }

  async function exchangeCode(code: string, codeVerifier: string): Promise<string | null> {
    try {
      const res = await fetch(`${apiBase}/api/mobile-auth/token-exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          state: request?.state ?? "",
          nonce: undefined,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.token ?? null;
    } catch {
      return null;
    }
  }

  const persistToken = useCallback(async (sid: string | null) => {
    setToken(sid);
    setAuthTokenGetter(() => sid);
    if (sid) {
      await AsyncStorage.setItem(STORAGE_KEY, sid);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    setBaseUrl(apiBase);
    setAuthTokenGetter(() => null);

    AsyncStorage.getItem(STORAGE_KEY).then(async (stored) => {
      if (stored) {
        const u = await fetchUser(stored);
        if (u) {
          setToken(stored);
          setAuthTokenGetter(() => stored);
          setUser(u);
        } else {
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      }
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (response?.type !== "success") return;
    const code = response.params.code;
    const codeVerifier = request?.codeVerifier;
    if (!code || !codeVerifier) return;

    (async () => {
      setIsLoading(true);
      const sid = await exchangeCode(code, codeVerifier);
      if (sid) {
        const u = await fetchUser(sid);
        if (u) {
          await persistToken(sid);
          setUser(u);
        }
      }
      setIsLoading(false);
    })();
  }, [response]);

  const login = useCallback(async () => {
    await promptAsync();
  }, [promptAsync]);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await fetch(`${apiBase}/api/mobile-auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    await persistToken(null);
    setUser(null);
  }, [token, persistToken]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
