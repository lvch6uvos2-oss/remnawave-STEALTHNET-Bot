import app from "./app.js";
import { env } from "./config/index.js";
import { prisma } from "./db.js";
import { ensureFirstAdmin } from "./modules/auth/auth.service.js";
import { ensureSystemSettings } from "./scripts/seed-system-settings.js";
import { startAutoBroadcastScheduler, stopAutoBroadcastScheduler } from "./modules/auto-broadcast/auto-broadcast-scheduler.js";
import { startContestDailyReminderScheduler, stopContestDailyReminderScheduler } from "./modules/contest/contest-daily-reminder-scheduler.js";
import { startAutoRenewScheduler } from "./modules/payment/auto-renew.cron.js";
import { startAutoBackupScheduler, stopAutoBackupScheduler } from "./modules/backup/auto-backup.scheduler.js";
import { startGiftExpiryCron } from "./modules/gift/gift-expiry.cron.js";
import { startAbandonedAccountsCleanup } from "./modules/client/abandoned-accounts.cron.js";
import { startMarketplaceScheduler, stopMarketplaceScheduler } from "./modules/marketplace/marketplace.scheduler.js";

async function main() {
  await prisma.$connect();

  await ensureFirstAdmin(env);
  await ensureSystemSettings();

  await startAutoBroadcastScheduler();
  startContestDailyReminderScheduler(env.CONTEST_REMINDER_CRON ?? undefined);
  startAutoRenewScheduler();
  startGiftExpiryCron();
  startAbandonedAccountsCleanup();
  await startAutoBackupScheduler();
  startMarketplaceScheduler();

  const server = app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`API v3.3.2 listening on port ${env.PORT}`);
  });

  const shutdown = async () => {
    stopAutoBroadcastScheduler();
    stopContestDailyReminderScheduler();
    stopAutoBackupScheduler();
    stopMarketplaceScheduler();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
