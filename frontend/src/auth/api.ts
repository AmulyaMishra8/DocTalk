import { api } from './client';

// The user shape the Auth service returns from GET /auth/me.
export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export type LoginResponse =
  | { status: 'ok'; user: PublicUser; accessToken: string }
  | { status: 'mfaRequired'; mfaToken: string };

// Typed wrappers around the Auth microservice's endpoints (reached via the Vite
// proxy). Only the flows NeuralHire surfaces are here; password reset / MFA
// setup / OAuth live in the full Auth web app, which we link out to.
export const authApi = {
  me: () => api.get<{ user: PublicUser }>('/auth/me'),

  login: (input: { email: string; password: string }) =>
    api.post<LoginResponse>('/auth/login', input),

  register: (input: { email: string; password: string; displayName?: string }) =>
    api.post<{ ok: boolean; message: string }>('/auth/register', input),

  // Second login step when the account has TOTP MFA enabled.
  mfaChallenge: (mfaToken: string, code: string) =>
    api.post<LoginResponse>('/mfa/totp/challenge', { mfaToken, code }),

  logout: () => api.post<{ ok: boolean }>('/auth/logout'),

  // --- Account management (used by the in-app Settings view) ---
  // Email a password-reset link (the reset itself happens via that link).
  forgotPassword: (email: string) =>
    api.post<{ ok: boolean; message: string }>('/auth/forgot-password', { email }),

  // Consumed by the in-app landing screens when a user clicks an email link
  // (…/verify-email?token= or …/reset-password?token=).
  verifyEmail: (token: string) => api.post<{ ok: boolean }>('/auth/verify-email', { token }),
  resetPassword: (token: string, password: string) =>
    api.post<{ ok: boolean }>('/auth/reset-password', { token, password }),

  // TOTP MFA: setup returns a QR + secret; confirm enables it and returns
  // one-time recovery codes; disable turns it off.
  mfaSetup: () =>
    api.post<{ otpauth: string; qrDataUrl: string; secret: string }>('/mfa/totp/setup'),
  mfaConfirm: (code: string) =>
    api.post<{ ok: boolean; recoveryCodes: string[] }>('/mfa/totp/confirm', { code }),
  mfaDisable: () => api.post<{ ok: boolean }>('/mfa/disable'),
};
