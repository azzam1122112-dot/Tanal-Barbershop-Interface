import type {
  Customer,
  PrismaClient,
  UserRole,
  WhatsAppMessageCategory,
  WhatsAppSafetyMode,
  WhatsAppTemplateType,
} from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit/audit-log";

type SafetyActorMeta = {
  actorUserId: string;
  actorType: Extract<UserRole, "OWNER" | "ADMIN" | "SUPERVISOR">;
  organizationId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type WhatsAppSafetySettingsInput = {
  mode?: WhatsAppSafetyMode;
  marketingCooldownHours?: number;
  maxMarketingPerCustomer30Days?: number;
  maxMessagesPerCustomer24Hours?: number;
  dailyOrganizationDraftLimit?: number;
  appendOptOutInstructions?: boolean;
  optOutText?: string;
  marketingPaused?: boolean;
};

export const WHATSAPP_SAFETY_DEFAULTS = {
  mode: "STRICT" as const,
  marketingCooldownHours: 168,
  maxMarketingPerCustomer30Days: 4,
  maxMessagesPerCustomer24Hours: 2,
  dailyOrganizationDraftLimit: 100,
  appendOptOutInstructions: true,
  optOutText: "لإيقاف العروض اكتب إيقاف",
  marketingPaused: false,
};

const MODE_PRESETS = {
  STRICT: {
    marketingCooldownHours: 168,
    maxMarketingPerCustomer30Days: 4,
    maxMessagesPerCustomer24Hours: 2,
    dailyOrganizationDraftLimit: 100,
  },
  BALANCED: {
    marketingCooldownHours: 72,
    maxMarketingPerCustomer30Days: 8,
    maxMessagesPerCustomer24Hours: 3,
    dailyOrganizationDraftLimit: 200,
  },
} as const;

export function categoryForTemplate(type?: WhatsAppTemplateType | null): WhatsAppMessageCategory {
  if (type === "CAMPAIGN" || type === "INACTIVE_CUSTOMER" || type === "REWARD_READY" || type === "CUSTOM") return "MARKETING";
  if (type === "POST_VISIT") return "TRANSACTIONAL";
  return "SERVICE";
}

export async function assertWhatsAppConsentForCategory(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    customer: Pick<Customer, "id" | "whatsappOptIn" | "whatsappTransactionalOptIn" | "whatsappMarketingOptIn">;
    category: WhatsAppMessageCategory;
  },
) {
  const settings = await getWhatsAppSafetySettings(prisma, input.organizationId);
  const consentAllowed = input.category === "MARKETING"
    ? input.customer.whatsappMarketingOptIn
    : input.customer.whatsappTransactionalOptIn;

  if (!input.customer.whatsappOptIn || !consentAllowed) {
    throw new BusinessError(
      input.category === "MARKETING"
        ? "لا يمكن الإرسال: العميل لم يوافق على الرسائل التسويقية"
        : "لا يمكن الإرسال: العميل لم يوافق على رسائل الخدمة والمعاملات",
      409,
    );
  }
  if (input.category === "MARKETING" && settings.marketingPaused) {
    throw new BusinessError("لا يمكن الإرسال: الحملات التسويقية متوقفة من مركز حماية واتساب", 409);
  }

  return settings;
}

export async function getWhatsAppSafetySettings(prisma: PrismaClient, organizationId: string) {
  const stored = await prisma.whatsAppSafetySettings.findUnique({ where: { organizationId } });
  return stored ?? { id: null, organizationId, ...WHATSAPP_SAFETY_DEFAULTS, createdAt: null, updatedAt: null };
}

export async function updateWhatsAppSafetySettings(
  prisma: PrismaClient,
  input: WhatsAppSafetySettingsInput,
  meta: SafetyActorMeta,
) {
  const before = await getWhatsAppSafetySettings(prisma, meta.organizationId);
  const selectedMode = input.mode ?? before.mode;
  const preset = selectedMode === "CUSTOM" ? {} : MODE_PRESETS[selectedMode];
  const data = {
    ...preset,
    ...input,
    optOutText: input.optOutText?.trim() || before.optOutText,
  };
  const settings = await prisma.whatsAppSafetySettings.upsert({
    where: { organizationId: meta.organizationId },
    create: { organizationId: meta.organizationId, ...WHATSAPP_SAFETY_DEFAULTS, ...data },
    update: data,
  });

  await writeAuditLog({
    prisma,
    organizationId: meta.organizationId,
    actorType: meta.actorType,
    actorUserId: meta.actorUserId,
    action: "whatsapp.safety_settings_updated",
    entityType: "WhatsAppSafetySettings",
    entityId: settings.id,
    before: serializeSafetySettings(before),
    after: serializeSafetySettings(settings),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return serializeSafetySettings(settings);
}

export async function evaluateWhatsAppPolicy(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    customer: Pick<Customer, "id" | "whatsappOptIn" | "whatsappTransactionalOptIn" | "whatsappMarketingOptIn">;
    category: WhatsAppMessageCategory;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const settings = await assertWhatsAppConsentForCategory(prisma, input);

  const since24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const cooldownSince = new Date(now.getTime() - settings.marketingCooldownHours * 60 * 60 * 1000);
  const activeStatuses = ["DRAFTED", "OPENED", "MARKED_SENT"] as const;
  const [organizationDrafts, customerMessages, marketingMessages, recentMarketing] = await Promise.all([
    prisma.whatsAppMessageLog.count({
      where: { organizationId: input.organizationId, createdAt: { gte: since24Hours }, status: { in: [...activeStatuses] } },
    }),
    prisma.whatsAppMessageLog.count({
      where: { customerId: input.customer.id, createdAt: { gte: since24Hours }, status: { in: [...activeStatuses] } },
    }),
    input.category === "MARKETING"
      ? prisma.whatsAppMessageLog.count({
          where: { customerId: input.customer.id, category: "MARKETING", createdAt: { gte: since30Days }, status: { in: [...activeStatuses] } },
        })
      : Promise.resolve(0),
    input.category === "MARKETING"
      ? prisma.whatsAppMessageLog.findFirst({
          where: { customerId: input.customer.id, category: "MARKETING", createdAt: { gte: cooldownSince }, status: { in: [...activeStatuses] } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
  ]);

  if (organizationDrafts >= settings.dailyOrganizationDraftLimit) {
    throw new BusinessError("تم بلوغ الحد الوقائي اليومي للمؤسسة. أوقف الإرسال وراجع جودة الجمهور.", 429);
  }
  if (customerMessages >= settings.maxMessagesPerCustomer24Hours) {
    throw new BusinessError("وصل العميل إلى الحد الوقائي للرسائل خلال 24 ساعة", 429);
  }
  if (input.category === "MARKETING" && marketingMessages >= settings.maxMarketingPerCustomer30Days) {
    throw new BusinessError("وصل العميل إلى الحد الشهري للعروض التسويقية", 429);
  }
  if (recentMarketing) {
    const availableAt = new Date(recentMarketing.createdAt.getTime() + settings.marketingCooldownHours * 60 * 60 * 1000);
    throw new BusinessError(`العميل داخل فترة تهدئة تسويقية حتى ${availableAt.toISOString()}`, 429);
  }

  return {
    settings,
    snapshot: {
      mode: settings.mode,
      category: input.category,
      consentVerified: true,
      organizationDrafts24Hours: organizationDrafts,
      customerMessages24Hours: customerMessages,
      customerMarketing30Days: marketingMessages,
      evaluatedAt: now.toISOString(),
    },
  };
}

export async function recordWhatsAppPolicyBlock(
  prisma: PrismaClient,
  input: { customerId: string; category: WhatsAppMessageCategory; reason: string },
  meta: SafetyActorMeta,
) {
  await writeAuditLog({
    prisma,
    organizationId: meta.organizationId,
    actorType: meta.actorType,
    actorUserId: meta.actorUserId,
    action: "whatsapp.message_blocked_by_policy",
    entityType: "Customer",
    entityId: input.customerId,
    after: { category: input.category, reason: input.reason },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export async function getWhatsAppSafetyOverview(prisma: PrismaClient, organizationId: string) {
  const settings = await getWhatsAppSafetySettings(prisma, organizationId);
  const now = new Date();
  const since24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const coolingSince = new Date(now.getTime() - settings.marketingCooldownHours * 60 * 60 * 1000);
  const [totalCustomers, transactionalConsents, marketingConsents, optedOut, messages24Hours, marketing30Days, blocked30Days, coolingCustomers] = await Promise.all([
    prisma.customer.count({ where: { organizationId } }),
    prisma.customer.count({ where: { organizationId, whatsappTransactionalOptIn: true } }),
    prisma.customer.count({ where: { organizationId, whatsappMarketingOptIn: true } }),
    prisma.customer.count({ where: { organizationId, whatsappOptOutAt: { not: null } } }),
    prisma.whatsAppMessageLog.count({ where: { organizationId, createdAt: { gte: since24Hours } } }),
    prisma.whatsAppMessageLog.count({ where: { organizationId, category: "MARKETING", createdAt: { gte: since30Days } } }),
    prisma.auditLog.count({ where: { organizationId, action: "whatsapp.message_blocked_by_policy", createdAt: { gte: since30Days } } }),
    prisma.customer.count({ where: { organizationId, whatsappLastMarketingAt: { gte: coolingSince } } }),
  ]);

  let protectionScore = 100;
  if (!settings.appendOptOutInstructions) protectionScore -= 12;
  if (settings.marketingCooldownHours < 72) protectionScore -= 18;
  if (settings.maxMarketingPerCustomer30Days > 8) protectionScore -= 15;
  if (messages24Hours > settings.dailyOrganizationDraftLimit * 0.8) protectionScore -= 15;
  protectionScore -= Math.min(20, blocked30Days * 2);
  protectionScore = Math.max(0, protectionScore);
  const riskLevel: "LOW" | "MEDIUM" | "HIGH" = protectionScore >= 85 ? "LOW" : protectionScore >= 65 ? "MEDIUM" : "HIGH";

  const recommendations: string[] = [];
  if (!settings.appendOptOutInstructions) recommendations.push("فعّل عبارة الإيقاف التلقائية في الرسائل التسويقية.");
  if (settings.marketingCooldownHours < 72) recommendations.push("ارفع فترة التهدئة التسويقية إلى 72 ساعة على الأقل.");
  if (blocked30Days > 0) recommendations.push("راجع العملاء الذين مُنعت رسائلهم قبل إطلاق الحملة التالية.");
  if (recommendations.length === 0) recommendations.push("إعدادات الحماية قوية. استمر في جمع الموافقات ومراقبة التفاعل.");

  return {
    settings: serializeSafetySettings(settings),
    metrics: {
      protectionScore,
      riskLevel,
      totalCustomers,
      transactionalConsents,
      marketingConsents,
      optedOut,
      messages24Hours,
      marketing30Days,
      blocked30Days,
      coolingCustomers,
      dailyUsagePercent: Math.min(100, Math.round((messages24Hours / Math.max(1, settings.dailyOrganizationDraftLimit)) * 100)),
    },
    recommendations,
  };
}

function serializeSafetySettings(settings: {
  id: string | null;
  organizationId: string;
  mode: WhatsAppSafetyMode;
  marketingCooldownHours: number;
  maxMarketingPerCustomer30Days: number;
  maxMessagesPerCustomer24Hours: number;
  dailyOrganizationDraftLimit: number;
  appendOptOutInstructions: boolean;
  optOutText: string;
  marketingPaused: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}) {
  return {
    id: settings.id,
    organizationId: settings.organizationId,
    mode: settings.mode,
    marketingCooldownHours: settings.marketingCooldownHours,
    maxMarketingPerCustomer30Days: settings.maxMarketingPerCustomer30Days,
    maxMessagesPerCustomer24Hours: settings.maxMessagesPerCustomer24Hours,
    dailyOrganizationDraftLimit: settings.dailyOrganizationDraftLimit,
    appendOptOutInstructions: settings.appendOptOutInstructions,
    optOutText: settings.optOutText,
    marketingPaused: settings.marketingPaused,
    createdAt: settings.createdAt?.toISOString() ?? null,
    updatedAt: settings.updatedAt?.toISOString() ?? null,
  };
}
