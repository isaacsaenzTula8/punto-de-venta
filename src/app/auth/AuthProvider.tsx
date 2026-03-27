import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../lib/api";

type UserRole = "superadmin" | "admin" | "manager" | "cashier";

interface UserPermissions {
  ordersCreate: boolean;
  salesCharge: boolean;
}

interface StoreSettings {
  cashierCanCharge: boolean;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  branchId?: number;
  branchName?: string | null;
  permissions: UserPermissions;
}

interface AuthContextValue {
  user: AuthUser | null;
  storeSettings: StoreSettings | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_TOKEN = "pos_auth_token";
const STORAGE_USER = "pos_auth_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const idleTimerRef = useRef<number | null>(null);

  const clearIdleTimer = () => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem(STORAGE_TOKEN);
    try {
      if (currentToken) {
        await apiRequest("/auth/logout", { method: "POST", token: currentToken });
      }
    } catch {
      // No bloquear cierre local por fallas de red.
    }

    clearIdleTimer();
    setUser(null);
    setStoreSettings(null);
    setToken(null);
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (!token) return;
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      logout();
    }, IDLE_TIMEOUT_MS);
  }, [logout, token]);

  useEffect(() => {
    if (!token) return;

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    const onActivity = () => resetIdleTimer();
    events.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    resetIdleTimer();

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, onActivity));
      clearIdleTimer();
    };
  }, [resetIdleTimer, token]);

  useEffect(() => {
    const savedToken = localStorage.getItem(STORAGE_TOKEN);
    const savedUser = localStorage.getItem(STORAGE_USER);
    if (!savedToken || !savedUser) {
      setLoading(false);
      return;
    }

    setToken(savedToken);
    try {
      setUser(JSON.parse(savedUser) as AuthUser);
    } catch {
      localStorage.removeItem(STORAGE_TOKEN);
      localStorage.removeItem(STORAGE_USER);
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }

    apiRequest("/auth/me", { token: savedToken })
      .then((me) => {
        const normalized: AuthUser = {
          id: Number(me.id),
          username: me.username,
          email: me.email,
          fullName: me.full_name || me.fullName,
          role: me.role,
          branchId: Number(me.branch_id || me.branchId || 1),
          branchName: me.branch_name || me.branchName || null,
          permissions: {
            ordersCreate: Boolean(me.permissions?.ordersCreate ?? true),
            salesCharge:
              Boolean(me.permissions?.salesCharge) ||
              ["superadmin", "admin", "manager"].includes(me.role),
          },
        };
        setUser(normalized);
        setStoreSettings({
          cashierCanCharge: Boolean(me.storeSettings?.cashierCanCharge ?? true),
        });
        localStorage.setItem(STORAGE_USER, JSON.stringify(normalized));
      })
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    const normalized: AuthUser = {
      id: Number(data.user.id),
      username: data.user.username,
      email: data.user.email,
      fullName: data.user.fullName || data.user.full_name,
      role: data.user.role,
      branchId: Number(data.user.branchId || data.user.branch_id || 1),
      branchName: data.user.branchName || data.user.branch_name || null,
      permissions: {
        ordersCreate: Boolean(data.user.permissions?.ordersCreate ?? true),
        salesCharge:
          Boolean(data.user.permissions?.salesCharge) ||
          ["superadmin", "admin", "manager"].includes(data.user.role),
      },
    };

    setToken(data.token);
    setUser(normalized);
    setStoreSettings({
      cashierCanCharge: Boolean(data.storeSettings?.cashierCanCharge ?? true),
    });
    localStorage.setItem(STORAGE_TOKEN, data.token);
    localStorage.setItem(STORAGE_USER, JSON.stringify(normalized));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      storeSettings,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      login,
      logout,
    }),
    [user, storeSettings, token, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
