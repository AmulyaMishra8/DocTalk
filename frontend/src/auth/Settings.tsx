import { useState } from 'react';
import { authApi } from './api';
import { ApiError } from './client';
import { useAuth } from './AuthContext';

// SVG status glyphs (no emoji as icons — per ui-ux-pro-max).
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);
const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
);

// In-app account settings — the "account portal" brought inside NeuralHire so
// users never leave for the separate Auth web app. Talks to the Auth service
// via the same proxy. Styled with NeuralHire's own theme (.card etc.).
export function Settings() {
  const { user, refresh, logout } = useAuth();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);

  if (!user) return null;

  async function sendReset() {
    setMsg(null);
    setResetBusy(true);
    try {
      await authApi.forgotPassword(user!.email);
      setMsg({ kind: 'ok', text: `Password reset link sent to ${user!.email}.` });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not send reset link.' });
    } finally {
      setResetBusy(false);
    }
  }

  async function disableMfa() {
    setMsg(null);
    setMfaBusy(true);
    try {
      await authApi.mfaDisable();
      await refresh();
      setMsg({ kind: 'ok', text: 'Two-factor authentication disabled.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not disable MFA.' });
    } finally {
      setMfaBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="workspace">
        <header className="settings-header">
          <span className="nb-eyebrow">Account</span>
          <h1 className="settings-title">Settings</h1>
          <p className="settings-sub">Manage your DocTalk account and security.</p>
        </header>

        {msg && (
          <div className={'status' + (msg.kind === 'error' ? ' error' : '')} style={{ marginBottom: '1.2rem' }}>
            <span className="dot" />
            {msg.text}
          </div>
        )}

        {/* Account */}
        <section className="settings-card">
          <h2 className="settings-card-title">Account</h2>
          <div className="set-list">
            <div className="set-row"><span className="set-label">Email</span><span className="set-value">{user.email}</span></div>
            <div className="set-row"><span className="set-label">Name</span><span className="set-value">{user.displayName ?? '—'}</span></div>
            <div className="set-row">
              <span className="set-label">Email verified</span>
              {user.emailVerified ? (
                <span className="verify-badge verify-ok"><CheckIcon /> Verified</span>
              ) : (
                <span className="verify-badge verify-warn"><AlertIcon /> Not verified</span>
              )}
            </div>
          </div>
        </section>

        {/* Password */}
        <section className="settings-card">
          <h2 className="settings-card-title">Password</h2>
          <p className="settings-card-desc">We'll email you a secure link to set a new password.</p>
          <button className="ghost" onClick={sendReset} disabled={resetBusy}>
            {resetBusy ? (<><span className="spinner" /> Sending…</>) : 'Send password reset link'}
          </button>
        </section>

        {/* Two-factor */}
        <section className="settings-card">
          <h2 className="settings-card-title">Two-factor authentication</h2>
          {user.mfaEnabled ? (
            <div className="row">
              <span className="verify-badge verify-ok"><CheckIcon /> Enabled</span>
              <span className="spacer" />
              <button className="secondary" onClick={disableMfa} disabled={mfaBusy}>
                {mfaBusy ? 'Disabling…' : 'Disable'}
              </button>
            </div>
          ) : (
            <MfaSetup onEnabled={refresh} />
          )}
        </section>

        <div className="settings-footer">
          <button className="secondary" onClick={logout}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

// The "turn on 2FA" flow: fetch QR -> user scans + types code -> show recovery codes.
function MfaSetup({ onEnabled }: { onEnabled: () => Promise<void> | void }) {
  const [qr, setQr] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function begin() {
    setError('');
    setBusy(true);
    try {
      const res = await authApi.mfaSetup();
      setQr({ qrDataUrl: res.qrDataUrl, secret: res.secret });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start setup');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await authApi.mfaConfirm(code.trim());
      setRecoveryCodes(res.recoveryCodes);
      await onEnabled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Wrong code');
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCodes) {
    return (
      <div>
        <div className="status" style={{ marginTop: 0 }}>
          <span className="dot" /> 2FA is on — save these recovery codes:
        </div>
        <div className="codes-grid">
          {recoveryCodes.map((c) => (
            <div key={c} className="code-pill">{c}</div>
          ))}
        </div>
        <p className="subtitle" style={{ margin: '0.8rem 0 0', fontSize: '0.8rem' }}>
          Each code works once. Store them somewhere safe — they're your way back in if you lose your authenticator.
        </p>
      </div>
    );
  }

  if (qr) {
    return (
      <form onSubmit={confirm}>
        <p className="subtitle" style={{ margin: '0 0 0.6rem' }}>
          Scan this with Google Authenticator, Authy, 1Password, etc.
        </p>
        <img className="qr-img" src={qr.qrDataUrl} alt="TOTP QR code" />
        <p className="subtitle" style={{ fontSize: '0.78rem' }}>
          Or enter this key manually: <code>{qr.secret}</code>
        </p>
        {error && <div className="status error"><span className="dot" />{error}</div>}
        <textarea
          style={{ minHeight: 'auto', padding: '0.6rem 0.8rem' }}
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter the 6-digit code to confirm"
        />
        <div className="row">
          <button disabled={busy || code.trim().length < 6}>
            {busy ? 'Confirming…' : 'Confirm & enable'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div>
      {error && <div className="status error"><span className="dot" />{error}</div>}
      <button onClick={begin} disabled={busy}>
        {busy ? 'Starting…' : 'Enable two-factor authentication'}
      </button>
    </div>
  );
}
