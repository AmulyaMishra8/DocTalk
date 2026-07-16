import { prisma } from "../db/prisma";
import { logger } from "../lib/logger";

// Background housekeeping. Verification/reset tokens are single-use and
// short-lived; once they're expired or consumed we don't need the rows, so we
// sweep them periodically to keep the table small.
export function startMaintenanceJobs() {
  const ONE_HOUR = 60 * 60 * 1000;

  const sweep = async () => {
    try {
      const { count } = await prisma.verificationToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { not: null } }] },
      });
      if (count > 0) logger.debug(`Maintenance: removed ${count} stale verification tokens`);
    } catch (err) {
      logger.warn({ err }, "Maintenance sweep failed");
    }
  };

  sweep(); // run once at startup
  setInterval(sweep, ONE_HOUR).unref();
}
