import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Logo } from '../Logo';

// Visual building blocks for the sign-in screens. All styling lives in auth.css,
// scoped under .nh-auth. Layout is a split screen: a constant brand panel on the
// left (identity + a live-looking "cited answer" proof of what DocTalk does) and
// the task-at-hand form on the right.

// The signature element: a static mock of DocTalk answering a question with a
// traceable citation. Not interactive — it's the panel's thesis in one glance.
function ProofCard() {
  return (
    <div className="proof-card" aria-hidden="true">
      <div className="proof-chrome">
        <span className="proof-dots"><i /><i /><i /></span>
        <span className="proof-doc">refund-policy.pdf</span>
      </div>
      <p className="proof-q"><span className="proof-caret">›</span> What&apos;s our refund window?</p>
      <p className="proof-a">
        Customers can request a full refund within 30 days of purchase.
        <sup className="proof-cite">1</sup>
      </p>
      <div className="proof-source">
        <span className="proof-ref">1</span>
        refund-policy.pdf · page 4
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <aside className="auth-brand">
      <div className="auth-brand-inner">
        <div className="brand-lockup">
          <Logo size={64} />
        </div>
        <h2 className="brand-headline">
          Ask your documents.<br />Get answers you can trace.
        </h2>
        <p className="brand-sub">
          Upload a PDF, ask in plain language, and read answers backed by the exact
          lines they came from.
        </p>
        <ProofCard />
      </div>
      <p className="brand-foot">Every answer, sourced.</p>
    </aside>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="nh-auth">
      <div className="auth-screen">
        <BrandPanel />
        <main className="auth-panel">
          <div className="auth-card">
            <div className="auth-mini-brand">
              <Logo size={44} />
            </div>
            <h1 className="auth-title">{title}</h1>
            {subtitle && <p className="auth-subtitle">{subtitle}</p>}
            {children}
            {footer && <div className="auth-footer">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const FormField = forwardRef<HTMLInputElement, FieldProps>(function FormField(
  { label, error, ...props },
  ref,
) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input ref={ref} className={`field-input ${error ? 'field-input--error' : ''}`} {...props} />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
});

export function Alert({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  if (!children) return null;
  return <div className={`alert alert--${kind}`}>{children}</div>;
}

// The official multi-color Google "G".
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

// Full-page-redirect to the Auth service's OAuth route (proxied to it). The
// provider sends the user back to the Auth API's callback, which sets the
// session cookies and redirects to NeuralHire.
export function SocialButtons() {
  return (
    <>
      <div className="divider"><span>or</span></div>
      <div className="social">
        <a className="btn btn-secondary" href="/oauth/google">
          <GoogleIcon />
          Continue with Google
        </a>
      </div>
    </>
  );
}
