import { useState } from 'react';
import { authApi } from './api';
import { ApiError } from './client';
import { useAuth } from './AuthContext';
import { AuthLayout, FormField, Alert, SocialButtons } from './components';

type Mode = 'login' | 'register' | 'mfa' | 'forgot';

// Sample account for interviewers/reviewers to sign in with one click. These
// must match a real account in the Auth service (see note in the PR/README).
const SAMPLE_EMAIL = 'interviewer@doctalk.app';
const SAMPLE_PASSWORD = 'Interview2026!';

// If an OAuth attempt bounced back to /login?error=… (from the Auth callback),
// surface a friendly message.
const oauthError = new URLSearchParams(window.location.search).get('error')
  ? "Social sign-in didn't complete. Please try again."
  : '';

export function LoginScreen() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');

  const [error, setError] = useState(oauthError);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setNotice('');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await authApi.login({ email: email.trim(), password });
      if (res.status === 'mfaRequired') {
        setMfaToken(res.mfaToken);
        switchMode('mfa');
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authApi.register({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
      });
      switchMode('login');
      setNotice('Account created. Check your email for a verification link, then sign in.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authApi.mfaChallenge(mfaToken, code.trim());
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authApi.forgotPassword(email.trim());
      switchMode('login');
      setNotice('If that email exists, a password reset link is on its way.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'mfa') {
    return (
      <AuthLayout
        title="Two-factor authentication"
        subtitle="Enter the code from your authenticator app"
        footer={
          <a onClick={() => switchMode('login')} role="button" tabIndex={0}>
            Back to sign in
          </a>
        }
      >
        <Alert kind="error">{error}</Alert>
        <form onSubmit={handleMfa}>
          <FormField
            label="6-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
          <button className="btn mt-16" disabled={busy || code.trim().length < 6}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>
        <p className="muted mt-16" style={{ fontSize: 13 }}>
          Lost your device? Enter one of your recovery codes instead.
        </p>
      </AuthLayout>
    );
  }

  if (mode === 'forgot') {
    return (
      <AuthLayout
        title="Reset your password"
        subtitle="We'll email you a secure reset link"
        footer={
          <a onClick={() => switchMode('login')} role="button" tabIndex={0}>
            Back to sign in
          </a>
        }
      >
        <Alert kind="error">{error}</Alert>
        <form onSubmit={handleForgot}>
          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn mt-16" disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      </AuthLayout>
    );
  }

  if (mode === 'register') {
    return (
      <AuthLayout
        title="Create account"
        subtitle="Create your DocTalk account"
        footer={
          <>
            Already have an account?{' '}
            <a onClick={() => switchMode('login')} role="button" tabIndex={0}>
              Sign in
            </a>
          </>
        }
      >
        <Alert kind="error">{error}</Alert>
        <form onSubmit={handleRegister}>
          <FormField
            label="Name"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FormField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn mt-16" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <SocialButtons />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Welcome to DocTalk"
      subtitle="Sign in to continue"
      footer={
        <>
          No account?{' '}
          <a onClick={() => switchMode('register')} role="button" tabIndex={0}>
            Create one
          </a>
        </>
      }
    >
      <Alert kind="error">{error}</Alert>
      <Alert kind="success">{notice}</Alert>
      <button
        type="button"
        className="demo-fill"
        onClick={() => {
          setEmail(SAMPLE_EMAIL);
          setPassword(SAMPLE_PASSWORD);
          setError('');
          setNotice('');
        }}
      >
        <span className="demo-spark">✦</span>
        Use sample interviewer login
      </button>
      <form onSubmit={handleLogin}>
        <FormField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FormField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="row-between mt-16">
          <span />
          <a className="muted" onClick={() => switchMode('forgot')} role="button" tabIndex={0}>
            Forgot password?
          </a>
        </div>
        <button className="btn mt-16" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <SocialButtons />
    </AuthLayout>
  );
}
