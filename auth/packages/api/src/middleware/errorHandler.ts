import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/AppError";
import { logger } from "../lib/logger";

// The single place that turns any thrown error into a JSON response. Mounted
// LAST in app.ts. Note the 4-argument signature — that's how Express knows it's
// an error handler.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "validation_error",
      message: "Invalid input",
      details: err.flatten().fieldErrors,
    });
  }

  // Anything else is an unexpected bug: log the detail, but tell the client
  // nothing that could help an attacker.
  logger.error({ err }, "Unhandled error");
  return res.status(500).json({ error: "internal_error", message: "Something went wrong" });
}
