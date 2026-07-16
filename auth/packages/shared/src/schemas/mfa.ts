import { z } from "zod";

// A TOTP code is always 6 digits. Recovery codes are longer strings.
export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

export const mfaConfirmSchema = z.object({
  code: totpCodeSchema,
});
export type MfaConfirmInput = z.infer<typeof mfaConfirmSchema>;

export const mfaChallengeSchema = z.object({
  // mfaToken proves the user already passed the password step.
  mfaToken: z.string().min(1),
  // Either a 6-digit TOTP code, or one of the one-time recovery codes.
  code: z.string().trim().min(6),
});
export type MfaChallengeInput = z.infer<typeof mfaChallengeSchema>;
