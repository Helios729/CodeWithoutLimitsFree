import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";

import { api, clearToken, getToken, setToken, unwrap } from "@/src/lib/api";

export type User = {
  id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  account_id: string;
};

export type Usage = {
  tier: "free" | "day_pass" | "monthly" | string;
  daily_prompts_used: number;
  daily_prompts_cap: number;
  daily_tokens_used: number;
  daily_tokens_cap: number;
  monthly_prompts_used: number;
  monthly_prompts_cap: number;
  monthly_tokens_used: number;
  blocked: boolean;
  reason: string;
  day_pass_expires_at?: string | null;
};

type Ctx = {
  user: User | null;
  usage: Usage | null;
  loading: boolean;
  refresh: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  exchangeSessionId: (sessionId: string) => Promise<User>;
  demoSignIn: () => Promise<User>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUsage = useCallback(async () => {
    try {
      const { data } = await api.get<Usage>("/usage/me");
      setUsage(data);
    } catch {
      setUsage(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setUsage(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<User>("/auth/me");
      setUser(data);
      await refreshUsage();
    } catch (err) {
      const e = unwrap(err);
      if (e.status === 401) {
        await clearToken();
        setUser(null);
        setUsage(null);
      }
    } finally {
      setLoading(false);
    }
  }, [refreshUsage]);

  const exchangeSessionId = useCallback(
    async (sessionId: string) => {
      const { data } = await api.post<{ token: string; user: User }>(
        "/auth/session",
        { session_id: sessionId },
      );
      await setToken(data.token);
      setUser(data.user);
      await refreshUsage();
      return data.user;
    },
    [refreshUsage],
  );

  const demoSignIn = useCallback(async () => {
    // Skips Google OAuth — backend issues a short-lived session for a
    // shared "Demo Presenter" account already provisioned at `monthly`
    // tier so every feature is reachable during a presentation.
    const { data } = await api.post<{ token: string; user: User }>(
      "/auth/demo",
      {},
    );
    await setToken(data.token);
    setUser(data.user);
    await refreshUsage();
    return data.user;
  }, [refreshUsage]);

  const signOut = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    await clearToken();
    setUser(null);
    setUsage(null);
  }, []);

  useEffect(() => {
    // Web: also pick up session_id from URL hash/query on first mount.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      const m =
        hash.match(/session_id=([^&]+)/) ||
        search.match(/session_id=([^&]+)/);
      if (m && m[1]) {
        const sid = decodeURIComponent(m[1]);
        exchangeSessionId(sid)
          .catch(() => {})
          .finally(() => {
            try {
              window.history.replaceState(null, "", window.location.pathname);
            } catch {}
            setLoading(false);
          });
        return;
      }
    }
    refresh();
  }, [refresh, exchangeSessionId]);

  const value = useMemo(
    () => ({
      user,
      usage,
      loading,
      refresh,
      refreshUsage,
      exchangeSessionId,
      demoSignIn,
      signOut,
    }),
    [user, usage, loading, refresh, refreshUsage, exchangeSessionId, demoSignIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
