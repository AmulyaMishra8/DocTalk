import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { prisma } from "./db/prisma";
import { redis } from "./lib/redis";
import { startMaintenanceJobs } from "./services/maintenance";
import { verifyMailer } from "./services/mailer";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`🔐 Auth API listening on http://localhost:${env.PORT}`);
  startMaintenanceJobs();
  void verifyMailer();
});

// Graceful shutdown: stop accepting connections, then close DB/Redis cleanly.
async function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
