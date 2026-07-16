import type { Request, Response, NextFunction, RequestHandler } from "express";

// Express (v4) doesn't catch errors thrown inside async handlers. This wrapper
// forwards any rejected promise to the global error handler, so controllers can
// just `throw` and not worry about try/catch on every line.
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
