import { useState } from "react";
import { authApi } from "../api/auth";
import { FormField } from "./FormField";
import { Alert } from "./Alert";

// A small self-contained "resend my verification email" form. Drop it anywhere;
// pass defaultEmail to pre-fill it. Always shows the same confirmation so it
// never reveals whether an account exists.
export function ResendVerification({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await authApi.resendVerification(email).catch(() => {});
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <Alert kind="success">
        If that account still needs verifying, a new link is on its way. Check your inbox (and, in
        dev, the API terminal).
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <button className="btn btn-secondary" disabled={busy || !email}>
        {busy ? "Sending…" : "Resend verification email"}
      </button>
    </form>
  );
}
