import type { PrismaClient } from "@prisma/client";
import { purgeExpiredRateLimits } from "@/lib/auth/rate-limit";

// الاحتفاظ بسجلات التدقيق لهذه المدة (يوم) قبل أرشفتها/حذفها.
const DEFAULT_AUDIT_RETENTION_DAYS = 365;
// الاحتفاظ برسائل واتساب المنتهية لهذه المدة (يوم).
const DEFAULT_WHATSAPP_RETENTION_DAYS = 180;

export type CleanupOptions = {
  now?: Date;
  auditRetentionDays?: number;
  whatsappRetentionDays?: number;
};

export type CleanupResult = {
  expiredSessions: number;
  rateLimits: number;
  auditLogs: number;
  whatsappMessages: number;
};

/**
 * صيانة دورية: حذف الجلسات المنتهية/الملغاة، عدادات المحاولات المنقضية،
 * وسجلات التدقيق ورسائل واتساب الأقدم من مدة الاحتفاظ.
 * آمنة لإعادة التشغيل (idempotent) ولا تلمس بيانات حيّة.
 */
export async function runMaintenanceCleanup(
  prisma: PrismaClient,
  options: CleanupOptions = {},
): Promise<CleanupResult> {
  const now = options.now ?? new Date();
  const auditRetentionDays = options.auditRetentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS;
  const whatsappRetentionDays = options.whatsappRetentionDays ?? DEFAULT_WHATSAPP_RETENTION_DAYS;

  const sessions = await prisma.session.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
    },
  });

  const rateLimits = await purgeExpiredRateLimits(prisma, now);

  const auditCutoff = daysAgo(now, auditRetentionDays);
  const auditLogs = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: auditCutoff } },
  });

  const whatsappCutoff = daysAgo(now, whatsappRetentionDays);
  const whatsappMessages = await prisma.whatsAppMessageLog.deleteMany({
    where: {
      createdAt: { lt: whatsappCutoff },
      status: { in: ["MARKED_SENT", "SKIPPED", "FAILED"] },
    },
  });

  return {
    expiredSessions: sessions.count,
    rateLimits,
    auditLogs: auditLogs.count,
    whatsappMessages: whatsappMessages.count,
  };
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
