import { z } from "zod";
import "dotenv/config";

// ----------------------------------------------------------------------------
// We validate the environment ONCE, at startup. If something is missing or
// malformed the app refuses to boot with a clear message — far better than a
// mysterious crash deep inside a request later on.
// ----------------------------------------------------------------------------

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  WEB_ORIGIN: z.string().url(),
  APP_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_PRIVATE_KEY_PATH: z.string().min(1),
  JWT_PUBLIC_KEY_PATH: z.string().min(1),
  // Optional: during key rotation, keep verifying tokens signed by the OLD key.
  JWT_PREVIOUS_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),

  ACCESS_TOKEN_TTL: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().default(1209600),
  MFA_TOKEN_TTL: z.coerce.number().default(300),

  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  COOKIE_DOMAIN: z.string().optional(),

  MFA_ISSUER: z.string().default("Auth Service"),

  // Encrypts TOTP secrets at rest. MUST be overridden in production.
  ENCRYPTION_KEY: z.string().min(1).default("dev-only-insecure-key-change-me"),

  // OAuth providers (optional — only needed if you enable social login).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Auth Service <no-reply@example.com>"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

// Safety net: never run in production with the insecure default encryption key.
if (isProd && env.ENCRYPTION_KEY === "dev-only-insecure-key-change-me") {
  console.error("❌ ENCRYPTION_KEY must be set to a strong random value in production");
  process.exit(1);
}
