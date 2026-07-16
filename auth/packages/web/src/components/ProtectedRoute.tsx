import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// Wraps routes that require login. While we're still checking the session we
// show a tiny loader; if there's no user we bounce to /login.
export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
