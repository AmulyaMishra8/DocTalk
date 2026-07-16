import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "../lib/AppError";

// Validates and SANITISES req.body against a Zod schema before the controller
// runs. On success it replaces req.body with the parsed (typed, trimmed) data;
// on failure it throws a 400 with the field-level errors.
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, "validation_error", "Invalid input", result.error.flatten().fieldErrors);
    }
    req.body = result.data;
    next();
  };
}
