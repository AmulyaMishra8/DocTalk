import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

// Convenience hook so components can do `const { user } = useAuth()`.
// Throws a clear error if used outside the provider.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
