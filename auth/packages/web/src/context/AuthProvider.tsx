import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "@auth/shared";
import { authApi } from "../api/auth";
import { AuthContext } from "./AuthContext";

// Holds the logged-in user in React state and keeps it in sync with the server.
// On first mount it asks GET /auth/me to discover whether a valid cookie
// session already exists (e.g. after a page refresh).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await authApi.me();
      setUser(user);
    } catch {
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
