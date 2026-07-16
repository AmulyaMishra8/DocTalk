import { Router } from "express";
import { getJwks } from "../lib/tokens";
import { asyncHandler } from "../middleware/asyncHandler";

export const wellKnownRouter = Router();

// Public keys so ANY of your other projects can verify access tokens issued by
// this service, without calling back here. This is what makes the tokens
// reusable across every project.
wellKnownRouter.get(
  "/jwks.json",
  asyncHandler(async (_req, res) => {
    res.json(await getJwks());
  }),
);
