import type { User } from "@prisma/client";
import type { PublicUser } from "@auth/shared";

// Converts a full database User into the safe, public shape we send to clients.
// Crucially this DROPS passwordHash, mfaSecret, recovery codes, etc.
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    mfaEnabled: user.mfaEnabled,
    createdAt: user.createdAt.toISOString(),
  };
}
