import { Router } from "express";
import * as oauth from "../controllers/oauthController";
import { asyncHandler } from "../middleware/asyncHandler";

export const oauthRouter = Router();

// GET /oauth/google or /oauth/github      -> redirect to the provider
// GET /oauth/google/callback (etc.)        -> provider sends the user back here
oauthRouter.get("/:provider", asyncHandler(oauth.start));
oauthRouter.get("/:provider/callback", asyncHandler(oauth.callback));
