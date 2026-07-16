import { useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { AuthLayout } from "../components/AuthLayout";
import { FormField } from "../components/FormField";
import { Alert } from "../components/Alert";

// Second login step. We arrive here from LoginPage carrying the mfaToken in
// router state. The user types the 6-digit code (or a recovery code).
export function MfaChallengePage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const location = useLocation();
  const mfaToken = (location.state as { mfaToken?: string } | null)?.mfaToken;

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // If someone lands here directly without a token, send them to login.
  if (!mfaToken) return <Navigate to="/login" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await authApi.mfaChallenge(mfaToken!, code.trim());
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Two-factor authentication" subtitle="Enter the code from your authenticator app">
      <Alert kind="error">{error}</Alert>
      <form onSubmit={onSubmit}>
        <FormField
          label="6-digit code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
        />
        <button className="btn mt-16" disabled={busy || code.length < 6}>
          {busy ? "Verifying…" : "Verify"}
        </button>
      </form>
      <p className="muted mt-16" style={{ fontSize: 13 }}>
        Lost your device? Enter one of your recovery codes instead.
      </p>
    </AuthLayout>
  );
}
