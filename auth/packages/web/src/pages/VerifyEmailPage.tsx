import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../api/auth";
import { AuthLayout } from "../components/AuthLayout";
import { Alert } from "../components/Alert";
import { ResendVerification } from "../components/ResendVerification";

// Reads ?token=... from the email link and confirms it with the API on load.
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const ran = useRef(false); // guard against React 18 double-invoke in dev

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get("token");
    if (!token) return setStatus("error");
    authApi
      .verifyEmail(token)
      .then(() => setStatus("ok"))
      .catch(() => setStatus("error"));
  }, [params]);

  return (
    <AuthLayout title="Email verification" footer={<Link to="/login">Go to sign in</Link>}>
      {status === "working" && <p className="muted">Verifying…</p>}
      {status === "ok" && <Alert kind="success">Your email is verified. You can sign in now.</Alert>}
      {status === "error" && (
        <>
          <Alert kind="error">This verification link is invalid or has expired.</Alert>
          <p className="muted mt-16" style={{ fontSize: 13 }}>
            Need a new link? Enter your email to resend.
          </p>
          <ResendVerification />
        </>
      )}
    </AuthLayout>
  );
}
