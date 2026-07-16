import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Logo } from './Logo';
import { ProfileMenu } from './ProfileMenu';
import './index.css';
import './auth/auth.css';
import './landing.css';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginScreen } from './auth/LoginScreen';
import { Landing } from './Landing';
import { Settings } from './auth/Settings';
import { VerifyEmailScreen, ResetPasswordScreen } from './auth/TokenLanding';

// Decides what the user sees based on their auth state: a loading flash while we
// check the cookie session, the marketing landing page (or sign-in screen) when
// logged out, or the app (with a top bar to reach Settings / sign out) when
// logged in.
function AuthGate() {
  const { user, loading, logout } = useAuth();
  const [view, setView] = useState<'app' | 'settings'>('app');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Logged-out visitors get the landing page at "/" and the form at "/login".
  // Too small a surface to justify a router: pushState + popstate is enough.
  const [showLogin, setShowLogin] = useState(() => window.location.pathname === '/login');

  useEffect(() => {
    const onPop = () => setShowLogin(window.location.pathname === '/login');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Once signed in, drop "/login" from the URL so a refresh doesn't land back
  // on the form (and signing out returns to the landing page, not the form).
  useEffect(() => {
    if (user && window.location.pathname === '/login') {
      window.history.replaceState({}, '', '/');
      setShowLogin(false);
    }
  }, [user]);

  if (loading) {
    return (
      <div className="nh-auth">
        <div className="auth-screen" />
      </div>
    );
  }

  if (!user) {
    if (showLogin) return <LoginScreen />;
    return (
      <Landing
        onSignIn={() => {
          window.history.pushState({}, '', '/login');
          setShowLogin(true);
        }}
      />
    );
  }

  return (
    <>
      <div className="app-topbar">
        {view === 'app' && (
          <button
            className="app-sidebar-toggle"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title="Toggle notebooks"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </button>
        )}
        <div className="app-topbar-brand">
          <Logo size={52} />
        </div>
        <span style={{ flex: 1 }} />
        <ProfileMenu
          user={user}
          inSettings={view === 'settings'}
          onToggleSettings={() => setView(view === 'settings' ? 'app' : 'settings')}
          onSignOut={logout}
        />
      </div>
      {view === 'settings' ? <Settings /> : <App sidebarOpen={sidebarOpen} />}
    </>
  );
}

// Email-link landing: if the URL is /verify-email?token=… or /reset-password?token=…
// (sent by the Auth service), handle it before the normal auth gate. On finish
// we strip the token from the URL and fall back to the gate (sign-in screen).
function Root() {
  const [path, setPath] = useState(window.location.pathname);
  const token = new URLSearchParams(window.location.search).get('token');

  const clearUrl = () => {
    window.history.replaceState({}, '', '/');
    setPath('/');
  };

  if (token && path.includes('/verify-email')) {
    return <VerifyEmailScreen token={token} onDone={clearUrl} />;
  }
  if (token && path.includes('/reset-password')) {
    return <ResetPasswordScreen token={token} onDone={clearUrl} />;
  }
  return <AuthGate />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>,
);
