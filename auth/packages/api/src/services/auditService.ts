import type { Request } from "express";
import { prisma } from "../db/prisma";
import { logger } from "../lib/logger";

// Writes a security event to the immutable audit trail. We never let an audit
// failure break the actual request, so errors are swallowed (but logged).
export async function recordEvent(
  event: string,
  opts: { req?: Request; userId?: string | null; metadata?: Record<string, unknown> } = {},
) {
  try {
    await prisma.auditLog.create({
      data: {
        event,
        userId: opts.userId ?? null,
        ip: opts.req?.ip ?? null,
        userAgent: opts.req?.get("user-agent") ?? null,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
      },
    });
  } catch (err) {
    logger.warn({ err, event }, "Failed to write audit log");
  }
}
