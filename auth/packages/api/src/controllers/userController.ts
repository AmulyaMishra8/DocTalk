import type { Request, Response } from "express";
import { getUserById } from "../services/authService";
import { toPublicUser } from "../lib/serializeUser";
import { Errors } from "../lib/AppError";

// Returns the currently logged-in user. requireAuth has already put the user id
// on req.user, so we just load the fresh record and serialise it safely.
export async function me(req: Request, res: Response) {
  const user = await getUserById(req.user!.id);
  if (!user) throw Errors.unauthorized();
  res.json({ user: toPublicUser(user) });
}
