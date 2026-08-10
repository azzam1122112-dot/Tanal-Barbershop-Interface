import type { PrismaClient } from "@prisma/client";
import { purgeExpiredRateLimits } from "@/lib/auth/rate-limit";

// الاحتفاظ بسجلات التدقيق لهذه المدة (يوم) قبل أرشفتها/حذفها.
const DEFAULT_AUDIT_RETENTION_DAYS = 365;
// الاحتفاظ برسائل واتساب المنتهية لهذه المدة (يوم).
const DEFAULT_WHATSAPP_RETENTION_DAYS = 30;
const DEFAULT_WHATSAPP_DRAFT_RETENTION_DAYS = 7;
const DEFAULT_INACTIVE_ORGANIZATION_RETENTION_DAYS = 60;

export type CleanupOptions = {
  now?: Date;
  auditRetentionDays?: number;
  whatsappRetentionDays?: number;
  whatsappDraftRetentionDays?: number;
  inactiveOrganizationRetentionDays?: number;
};

export type CleanupResult = {
  expiredSessions: number;
  rateLimits: number;
  auditLogs: number;
  whatsappMessages: number;
  whatsappDraftsScrubbed: number;
  organizationsMarkedInactive: number;
  organizationsDeleted: number;
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
  const whatsappDraftRetentionDays = options.whatsappDraftRetentionDays ?? DEFAULT_WHATSAPP_DRAFT_RETENTION_DAYS;
  const inactiveOrganizationRetentionDays = options.inactiveOrganizationRetentionDays ?? DEFAULT_INACTIVE_ORGANIZATION_RETENTION_DAYS;

  // ثبّت لحظة بدء عدم النشاط مرة واحدة؛ إعادة تشغيل الصيانة لا تمدد مهلة الحذف.
  const expiredOrganizations = await prisma.organization.findMany({
    where: {
      inactiveSince: null,
      OR: [
        { subscriptionStatus: "TRIALING", trialEndsAt: { lte: now } },
        { subscriptionStatus: "TRIALING", trialEndsAt: null },
        { subscriptionStatus: "ACTIVE", currentPeriodEnd: { lte: now } },
        { subscriptionStatus: "CANCELED", currentPeriodEnd: { lte: now } },
        { subscriptionStatus: "PAST_DUE" },
      ],
    },
    select: { id: true, subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true, createdAt: true, updatedAt: true },
  });
  let organizationsMarkedInactive = 0;
  for (const organization of expiredOrganizations) {
    const inactiveSince = organization.subscriptionStatus === "TRIALING"
      ? organization.trialEndsAt ?? organization.createdAt
      : organization.currentPeriodEnd ?? organization.updatedAt ?? now;
    const updated = await prisma.organization.updateMany({
      where: { id: organization.id, inactiveSince: null },
      data: { subscriptionStatus: "PAST_DUE", inactiveSince },
    });
    organizationsMarkedInactive += updated.count;
  }

  const deletionCutoff = daysAgo(now, inactiveOrganizationRetentionDays);
  const organizationsDeleted = await prisma.organization.deleteMany({
    where: { inactiveSince: { lte: deletionCutoff } },
  });

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

  const draftCutoff = daysAgo(now, whatsappDraftRetentionDays);
  const whatsappDraftsScrubbed = await prisma.whatsAppMessageLog.updateMany({
    where: { createdAt: { lt: draftCutoff }, status: { in: ["DRAFTED", "OPENED"] } },
    data: {
      status: "FAILED",
      phone: "[PURGED]",
      message: "[PURGED_EXPIRED_DRAFT]",
      waUrl: "",
      skippedReason: "انتهت مدة الاحتفاظ بالمسودة دون إرسال",
    },
  });

  return {
    expiredSessions: sessions.count,
    rateLimits,
    auditLogs: auditLogs.count,
    whatsappMessages: whatsappMessages.count,
    whatsappDraftsScrubbed: whatsappDraftsScrubbed.count,
    organizationsMarkedInactive,
    organizationsDeleted: organizationsDeleted.count,
  };
}

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
