import { useEffect, useState } from 'react';
import { authApi } from './api';
import { ApiError } from './client';
import { AuthLayout, FormField, Alert } from './components';

// Handles the links the Auth service emails out. Those point at NeuralHire now
// (WEB_ORIGIN=:5174): /verify-email?token=… and /reset-password?token=…. We read
// the token from the URL, complete the action against the Auth API, then send
// the user on to sign in. `onDone` clears the URL and returns to the normal app.

export function VerifyEmailScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    authApi
      .verifyEmail(token)
      .then(() => setState('ok'))
      .catch((err) => {
        setState('error');
        setMsg(err instanceof ApiError ? err.message : 'This link is invalid or has expired.');
      });
  }, [token]);

  return (
    <AuthLayout
      title="Email verification"
      footer={<a onClick={onDone} role="button" tabIndex={0}>Continue to sign in</a>}
    >
      {state === 'working' && <p className="muted">Verifying your email…</p>}
      {state === 'ok' && <Alert kind="success">Your email is verified. You can sign in now.</Alert>}
      {state === 'error' && <Alert kind="error">{msg}</Alert>}
    </AuthLayout>
  );
}

export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'This link is invalid or has expired.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthLayout
        title="Password updated"
        footer={<a onClick={onDone} role="button" tabIndex={0}>Continue to sign in</a>}
      >
        <Alert kind="success">Your password has been changed. Sign in with your new password.</Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="At least 10 characters"
      footer={<a onClick={onDone} role="button" tabIndex={0}>Back to sign in</a>}
    >
      <Alert kind="error">{error}</Alert>
      <form onSubmit={submit}>
        <FormField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn mt-16" disabled={busy || password.length < 10}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthLayout>
  );
}
