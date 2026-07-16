import type { Request, Response } from "express";

// Mounted after all routes: any URL we don't recognise gets a clean 404.
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "not_found", message: "Route not found" });
}
