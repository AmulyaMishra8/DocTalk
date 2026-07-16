import { createContext } from "react";
import type { PublicUser } from "@auth/shared";

// The shape of everything the rest of the app can read/do about auth.
export interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean; // true while we check "am I logged in?" on first load
  setUser: (user: PublicUser | null) => void;
  refresh: () => Promise<void>; // re-fetch the current user
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
