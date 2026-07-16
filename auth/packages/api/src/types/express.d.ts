// Adds our custom fields to Express's Request type so TypeScript knows about
// req.user and req.authVia everywhere.

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
      // How the caller authenticated: "cookie" (browser) or "bearer" (API client).
      authVia?: "cookie" | "bearer";
    }
  }
}

export {};
