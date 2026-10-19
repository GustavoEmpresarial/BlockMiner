/**
 * Renewal is manual: 7 days and 1 day before a profile-photo license expires the user gets an
 * in-app notification. Runs hourly over a one-hour window per threshold; a notification with the
 * same title in the last 2 days suppresses a repeat (restarts inside the window).
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { createNotification } from "../notifications/notifications.service.js";

const log = logger.child("AvatarReminders");
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const AVATAR_REMINDERS = [
  { days: 7, title: "Profile photo license expires in 7 days" },
  { days: 1, title: "Profile photo license expires tomorrow" },
] as const;

const MESSAGE = "Renew it on the Offers page (US$ 1) or in Settings (US$ 1.50) to keep your profile photo visible.";

export async function runAvatarExpiryReminders(now = new Date()): Promise<{ notified: number }> {
  let notified = 0;
  for (const r of AVATAR_REMINDERS) {
    const from = new Date(now.getTime() + r.days * DAY_MS);
    const to = new Date(from.getTime() + HOUR_MS);
    const due = await prisma.userAvatar.findMany({
      where: { licenseExpiresAt: { gte: from, lt: to } },
      select: { userId: true },
      take: 5000,
    });
    for (const { userId } of due) {
      const recent = await prisma.notification.findFirst({
        where: { userId, title: r.title, createdAt: { gte: new Date(now.getTime() - 2 * DAY_MS) } },
        select: { id: true },
      });
      if (recent) continue;
      await createNotification({ userId, title: r.title, message: MESSAGE, type: "warning" });
      notified += 1;
    }
  }
  if (notified > 0) log.info("avatar.license.reminders_sent", { notified });
  return { notified };
}

export function startAvatarExpiryReminderCron(): { stop: () => void } {
  const run = () => {
    runAvatarExpiryReminders().catch((err) => {
      log.warn("AVATAR_REMINDER_RUN_FAILED", { error: err instanceof Error ? err.message : String(err) });
    });
  };
  run();
  const handle = setInterval(run, HOUR_MS);
  handle.unref?.();
  log.info("Avatar expiry reminder cron started", { intervalMs: HOUR_MS });
  return { stop: () => clearInterval(handle) };
}
