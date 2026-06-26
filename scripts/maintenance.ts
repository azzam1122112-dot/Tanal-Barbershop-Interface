import { PrismaClient } from "@prisma/client";
import { runMaintenanceCleanup } from "../lib/maintenance/cleanup";
import { logger } from "../lib/logger";

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await runMaintenanceCleanup(prisma);
    logger.info("maintenance.cleanup.cron", result);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  logger.error("maintenance.cleanup.cron_failed", error);
  process.exit(1);
});
