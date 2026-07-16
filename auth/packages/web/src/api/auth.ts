import { api } from "./client";
import type {
  PublicUser,
  LoginInput,
  RegisterInput,
  LoginResponse,
} from "@auth/shared";

// Typed wrappers around each endpoint. Components call these — they never touch
// fetch directly. Because the input/output types come from @auth/shared, the
// frontend and backend can never disagree about the shapes.

export const authApi = {
  register: (input: RegisterInput) =>
    api.post<{ ok: boolean; message: string }>("/auth/register", input),

  login: (input: LoginInput) => api.post<LoginResponse>("/auth/login", input),

  verifyEmail: (token: string) => api.post<{ ok: boolean }>("/auth/verify-email", { token }),

  resendVerification: (email: string) =>
    api.post<{ ok: boolean; message: string }>("/auth/resend-verification", { email }),

  forgotPassword: (email: string) =>
    api.post<{ ok: boolean; message: string }>("/auth/forgot-password", { email }),

  resetPassword: (token: string, password: string) =>
    api.post<{ ok: boolean }>("/auth/reset-password", { token, password }),

  logout: () => api.post<{ ok: boolean }>("/auth/logout"),

  me: () => api.get<{ user: PublicUser }>("/auth/me"),

  // MFA
  mfaSetup: () => api.post<{ otpauth: string; qrDataUrl: string; secret: string }>("/mfa/totp/setup"),
  mfaConfirm: (code: string) =>
    api.post<{ ok: boolean; recoveryCodes: string[] }>("/mfa/totp/confirm", { code }),
  mfaChallenge: (mfaToken: string, code: string) =>
    api.post<LoginResponse>("/mfa/totp/challenge", { mfaToken, code }),
  mfaDisable: () => api.post<{ ok: boolean }>("/mfa/disable"),
};
