// Shapes the API returns to clients. Kept here so the React app gets full
// type-safety on every response without redefining anything.

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  // refreshToken is only returned to non-browser (bearer) clients;
  // browsers receive it as an httpOnly cookie instead.
  refreshToken?: string;
}

// Returned by POST /auth/login.
export type LoginResponse =
  | { status: "ok"; user: PublicUser; accessToken: string; refreshToken?: string }
  | { status: "mfaRequired"; mfaToken: string };

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
