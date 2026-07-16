import { useState } from "react";
import { authApi } from "../api/auth";
import { ApiError } from "../api/client";
import { FormField } from "./FormField";
import { Alert } from "./Alert";

// The "turn on 2FA" flow, used inside the Profile page:
//   1. fetch a QR code   2. user scans + types first code   3. show recovery codes
export function MfaSetup({ onEnabled }: { onEnabled: () => void }) {
  const [qr, setQr] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function begin() {
    setError("");
    setBusy(true);
    try {
      const res = await authApi.mfaSetup();
      setQr({ qrDataUrl: res.qrDataUrl, secret: res.secret });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start setup");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await authApi.mfaConfirm(code.trim());
      setRecoveryCodes(res.recoveryCodes);
      onEnabled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Wrong code");
    } finally {
      setBusy(false);
    }
  }

  // Final state: show the one-time recovery codes.
  if (recoveryCodes) {
    return (
      <div>
        <Alert kind="success">Two-factor authentication is on. Save these recovery codes:</Alert>
        <div className="codes">
          {recoveryCodes.map((c) => (
            <div key={c} className="code-pill">{c}</div>
          ))}
        </div>
        <p className="muted mt-16" style={{ fontSize: 13 }}>
          Each code works once. Store them somewhere safe — they're your way back in if you lose your
          authenticator.
        </p>
      </div>
    );
  }

  // Step 2: show QR + ask for the first code.
  if (qr) {
    return (
      <form onSubmit={confirm}>
        <p className="muted">Scan this with Google Authenticator, Authy, 1Password, etc.</p>
        <img className="qr" src={qr.qrDataUrl} alt="TOTP QR code" />
        <p className="muted" style={{ fontSize: 12 }}>
          Or enter this key manually: <code>{qr.secret}</code>
        </p>
        <Alert kind="error">{error}</Alert>
        <FormField
          label="Enter the 6-digit code to confirm"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
        />
        <button className="btn" disabled={busy || code.length < 6}>
          {busy ? "Confirming…" : "Confirm & enable"}
        </button>
      </form>
    );
  }

  // Step 1: the entry button.
  return (
    <div>
      <Alert kind="error">{error}</Alert>
      <button className="btn" onClick={begin} disabled={busy}>
        {busy ? "Starting…" : "Enable two-factor authentication"}
      </button>
    </div>
  );
}
