import nodemailer from "nodemailer";
import { env } from "../config/env";
import { logger } from "../lib/logger";

// ----------------------------------------------------------------------------
// Email sending. If SMTP isn't configured (typical in local dev) we DON'T fail
// — we just log the message (including the link) to the console so you can
// click through while developing. In production, set the SMTP_* env vars.
// ----------------------------------------------------------------------------

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      // Fail fast if the SMTP server is wrong/unreachable, so a bad config can't
      // make requests hang for a minute.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
  : null;

// Called once at startup so SMTP problems surface immediately (right credentials,
// reachable host) rather than only when the first email is sent.
export async function verifyMailer() {
  if (!transport) {
    logger.info("✉️  Email: SMTP not configured — links will print to the console");
    return;
  }
  try {
    await transport.verify();
    logger.info(`✉️  Email: SMTP ready via ${env.SMTP_HOST}`);
  } catch (err) {
    logger.warn({ err }, "✉️  Email: SMTP verify failed — check SMTP_USER/SMTP_PASS");
  }
}

async function send(to: string, subject: string, html: string, text: string) {
  if (!transport) {
    logger.info({ to, subject, text }, "📧 [dev] email (SMTP not configured)");
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, html, text });
}

export function sendVerificationEmail(to: string, link: string) {
  return send(
    to,
    "Verify your email",
    `<p>Welcome! Confirm your email by clicking <a href="${link}">this link</a>.</p>`,
    `Confirm your email: ${link}`,
  );
}

export function sendPasswordResetEmail(to: string, link: string) {
  return send(
    to,
    "Reset your password",
    `<p>Reset your password using <a href="${link}">this link</a>. It expires in 1 hour.</p>`,
    `Reset your password: ${link}`,
  );
}
