import { BusinessError } from "@/lib/errors";
import type {
  Campaign,
  Customer,
  LoyaltyAccount,
  ManagerReward,
  Prisma,
  PrismaClient,
  UserRole,
  WhatsAppMessageLog,
  WhatsAppMessageStatus,
  WhatsAppTemplateType,
} from "@prisma/client";
import { normalizeSaudiPhone, toSaudiWhatsAppPhone } from "@/lib/phone/saudi-phone";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { getActiveManagerRewards } from "@/lib/manager-rewards/manager-reward-service";

type WhatsAppPrisma = PrismaClient | Prisma.TransactionClient;

type ActorMeta = {
  actorUserId: string;
  actorType: Extract<UserRole, "OWNER" | "ADMIN" | "SUPERVISOR">;
  organizationId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type GenerateInput = {
  customerId: string;
  templateId?: string;
  contextType?: WhatsAppTemplateType;
  visitId?: string;
  campaignId?: string;
  customMessage?: string;
};

const allowedVariables = new Set([
  "name",
  "phone",
  "points",
  "reward_discount",
  "manager_reward_title",
  "manager_reward_discount",
  "manager_reward_expires",
  "last_visit",
  "days_since_last_visit",
  "campaign_name",
  "campaign_discount",
  "visit_net_amount",
  "visit_points_earned",
  "salon_name",
]);

export function buildWhatsAppUrl(phone: string, message: string) {
  const normalizedPhone = toSaudiWhatsAppPhone(phone);
  if (!message.trim()) {
    throw new BusinessError("نص الرسالة مطلوب");
  }
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

export function renderWhatsAppTemplate(body: string, variables: Record<string, unknown>) {
  return body.replace(/\{([a-z_]+)\}/gi, (_match, key: string) => {
    const normalizedKey = key.toLowerCase();
    if (!allowedVariables.has(normalizedKey)) return "";
    return sanitizeMessageValue(variables[normalizedKey]);
  });
}

export async function getWhatsAppTemplates(prisma: WhatsAppPrisma, organizationId?: string) {
  const templates = await prisma.whatsAppTemplate.findMany({
    where: { ...(organizationId ? { organizationId } : {}) },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
  return templates.map(toSafeTemplate);
}

export async function createWhatsAppTemplate(
  prisma: PrismaClient,
  input: { name: string; type: WhatsAppTemplateType; body: string; isActive?: boolean },
  meta: ActorMeta,
) {
  const template = await prisma.whatsAppTemplate.create({
    data: {
      organizationId: meta.organizationId,
      name: input.name,
      type: input.type,
      body: input.body,
      isActive: input.isActive ?? true,
    },
  });
  await writeAuditLog({
    prisma,
    organizationId: meta.organizationId,
    actorType: meta.actorType,
    actorUserId: meta.actorUserId,
    action: "whatsapp.template_created",
    entityType: "WhatsAppTemplate",
    entityId: template.id,
    after: toSafeTemplate(template),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return toSafeTemplate(template);
}

export async function updateWhatsAppTemplate(
  prisma: PrismaClient,
  id: string,
  input: Partial<{ name: string; type: WhatsAppTemplateType; body: string; isActive: boolean }>,
  meta: ActorMeta,
) {
  const before = await prisma.whatsAppTemplate.findFirst({ where: { id, ...(meta.organizationId ? { organizationId: meta.organizationId } : {}) } });
  if (!before) throw new BusinessError("قالب واتساب غير موجود");
  const template = await prisma.whatsAppTemplate.update({ where: { id }, data: input });
  await writeAuditLog({
    prisma,
    organizationId: meta.organizationId,
    actorType: meta.actorType,
    actorUserId: meta.actorUserId,
    action: before.isActive !== template.isActive ? "whatsapp.template_status_updated" : "whatsapp.template_updated",
    entityType: "WhatsAppTemplate",
    entityId: template.id,
    before: toSafeTemplate(before),
    after: toSafeTemplate(template),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return toSafeTemplate(template);
}

export async function generateWhatsAppMessage(prisma: PrismaClient, input: GenerateInput, meta: ActorMeta) {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    include: {
      loyaltyAccount: true,
      visits: { orderBy: { visitedAt: "desc" }, take: 1 },
    },
  });
  if (!customer) throw new BusinessError("العميل غير موجود");
  if (!customer.whatsappOptIn) {
    throw new BusinessError("العميل لا يرغب باستلام رسائل واتساب");
  }

  const phone = normalizeSaudiPhone(customer.phone);
  const template = input.templateId
    ? await prisma.whatsAppTemplate.findUnique({ where: { id: input.templateId } })
    : null;
  if (input.templateId && (!template || !template.isActive)) {
    throw new BusinessError("قالب واتساب غير متاح");
  }

  const [settings, visit, campaign, reward, managerRewards] = await Promise.all([
    prisma.systemSettings.findFirst({}),
    input.visitId
      ? prisma.visit.findUnique({
          where: { id: input.visitId },
          include: { customer: true },
        })
      : null,
    input.campaignId ? prisma.campaign.findUnique({ where: { id: input.campaignId } }) : null,
    getBestAvailableReward(prisma, customer.loyaltyAccount?.points ?? 0),
    getActiveManagerRewards(prisma, customer.id),
  ]);
  const managerReward = managerRewards[0] ?? null;

  if (settings?.whatsappEnabled === false) {
    throw new BusinessError("واتساب معطل من إعدادات النظام");
  }

  if (input.visitId && (!visit || visit.customerId !== customer.id)) {
    throw new BusinessError("الزيارة غير موجودة لهذا العميل");
  }
  if (input.campaignId && !campaign) {
    throw new BusinessError("الحملة غير موجودة");
  }

  const variables = buildVariables({
    customer,
    points: customer.loyaltyAccount?.points ?? 0,
    salonName: settings?.salonName ?? "صالون تانال",
    visit,
    campaign,
    managerReward,
    rewardDiscount: managerReward ? managerReward.discountAmount : reward ? Number(reward.discountAmount) : "",
  });
  const body = input.customMessage?.trim() || template?.body || "";
  const message = renderWhatsAppTemplate(body, variables).trim();
  const waUrl = buildWhatsAppUrl(phone, message);
  const log = await prisma.whatsAppMessageLog.create({
    data: {
      organizationId: customer.organizationId,
      customerId: customer.id,
      templateId: template?.id,
      campaignId: campaign?.id,
      visitId: visit?.id,
      phone,
      message,
      waUrl,
      status: "DRAFTED",
    },
    include: messageLogInclude,
  });

  await writeAuditLog({
    prisma,
    organizationId: meta.organizationId,
    actorType: meta.actorType,
    actorUserId: meta.actorUserId,
    action: "whatsapp.message_drafted",
    entityType: "WhatsAppMessageLog",
    entityId: log.id,
    after: toSafeMessageLog(log),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return toGeneratedMessage(log);
}

export async function markWhatsAppMessageOpened(prisma: PrismaClient, id: string, meta: ActorMeta) {
  await assertMessageInOrg(prisma, id, meta.organizationId);
  const log = await prisma.whatsAppMessageLog.update({
    where: { id },
    data: {
      status: "OPENED",
      openedByUserId: meta.actorUserId,
      openedAt: new Date(),
    },
    include: messageLogInclude,
  });
  await writeAuditLog({
    prisma,
    organizationId: meta.organizationId,
    actorType: meta.actorType,
    actorUserId: meta.actorUserId,
    action: "whatsapp.message_opened",
    entityType: "WhatsAppMessageLog",
    entityId: log.id,
    after: toSafeMessageLog(log),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return toSafeMessageLog(log);
}

export async function markWhatsAppMessageSent(prisma: PrismaClient, id: string, meta: ActorMeta) {
  await assertMessageInOrg(prisma, id, meta.organizationId);
  const log = await prisma.whatsAppMessageLog.update({
    where: { id },
    data: {
      status: "MARKED_SENT",
      markedSentByUserId: meta.actorUserId,
      markedSentAt: new Date(),
    },
    include: messageLogInclude,
  });
  await writeAuditLog({
    prisma,
    organizationId: meta.organizationId,
    actorType: meta.actorType,
    actorUserId: meta.actorUserId,
    action: "whatsapp.message_marked_sent",
    entityType: "WhatsAppMessageLog",
    entityId: log.id,
    after: toSafeMessageLog(log),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return toSafeMessageLog(log);
}

export async function getWhatsAppMessages(
  prisma: WhatsAppPrisma,
  filters: { organizationId?: string; from?: Date; to?: Date; status?: WhatsAppMessageStatus; templateType?: WhatsAppTemplateType; customerId?: string } = {},
) {
  const from = filters.from ? startOfDay(filters.from) : undefined;
  const to = filters.to ? endExclusive(filters.to) : undefined;
  const logs = await prisma.whatsAppMessageLog.findMany({
    where: {
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
      ...(filters.templateType ? { template: { type: filters.templateType } } : {}),
    },
    include: messageLogInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return logs.map(toSafeMessageLog);
}

export async function getInactiveWhatsAppAudience(prisma: WhatsAppPrisma, days = 30, organizationId?: string) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const customers = await prisma.customer.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      lastVisitAt: { lt: cutoff },
      visitCount: { gt: 0 },
    },
    include: { loyaltyAccount: true },
    orderBy: { lastVisitAt: "asc" },
    take: 100,
  });
  return customers.map((customer) => toAudienceCustomer(customer, now));
}

export async function getRewardReadyWhatsAppAudience(prisma: WhatsAppPrisma, organizationId?: string) {
  const now = new Date();
  const minRule = await prisma.rewardRule.findFirst({
    where: { isActive: true, ...(organizationId ? { organizationId } : {}) },
    orderBy: { requiredPoints: "asc" },
  });
  const rewardFilters: Prisma.CustomerWhereInput[] = [
    {
      managerRewards: {
        some: {
          redeemedAt: null,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        },
      },
    },
  ];
  if (minRule) {
    rewardFilters.push({ loyaltyAccount: { points: { gte: minRule.requiredPoints } } });
  }
  const customers = await prisma.customer.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      OR: rewardFilters,
    },
    include: {
      loyaltyAccount: true,
      managerRewards: {
        where: {
          redeemedAt: null,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        },
        orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return customers.map((customer) => toAudienceCustomer(customer, now));
}

export async function getCampaignWhatsAppAudience(prisma: WhatsAppPrisma, campaignId: string, organizationId?: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new BusinessError("الحملة غير موجودة");
  const now = new Date();
  const customers = await prisma.customer.findMany({
    where: { ...(organizationId ? { organizationId } : {}) },
    include: { loyaltyAccount: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const eligible = [];
  for (const customer of customers) {
    if (!(await isCampaignCustomerEligible(prisma, campaign, customer, now))) continue;
    eligible.push({
      ...toAudienceCustomer(customer, now),
      campaignName: campaign.name,
      campaignDiscount: formatCampaignDiscount(campaign),
    });
  }
  return eligible.slice(0, 100);
}

export async function updateCustomerWhatsappPreference(prisma: PrismaClient, customerId: string, whatsappOptIn: boolean, meta: ActorMeta) {
  const before = await prisma.customer.findFirst({ where: { id: customerId, ...(meta.organizationId ? { organizationId: meta.organizationId } : {}) } });
  if (!before) throw new BusinessError("العميل غير موجود");
  const customer = await prisma.customer.update({ where: { id: customerId }, data: { whatsappOptIn } });
  await writeAuditLog({
    prisma,
    organizationId: meta.organizationId,
    actorType: meta.actorType,
    actorUserId: meta.actorUserId,
    action: "whatsapp.customer_preference_updated",
    entityType: "Customer",
    entityId: customer.id,
    before: { whatsappOptIn: before.whatsappOptIn },
    after: { whatsappOptIn: customer.whatsappOptIn },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    whatsappOptIn: customer.whatsappOptIn,
  };
}

export function toSafeTemplate(template: { id: string; name: string; type: WhatsAppTemplateType; body: string; isActive: boolean; createdAt: Date; updatedAt: Date }) {
  return {
    id: template.id,
    name: template.name,
    type: template.type,
    body: template.body,
    isActive: template.isActive,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

async function assertMessageInOrg(prisma: WhatsAppPrisma, id: string, organizationId?: string) {
  if (!organizationId) return;
  const exists = await prisma.whatsAppMessageLog.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!exists) throw new BusinessError("رسالة واتساب غير موجودة");
}

function toGeneratedMessage(log: MessageLogWithRelations) {
  return {
    messageLogId: log.id,
    customer: {
      id: log.customer.id,
      name: log.customer.name,
      phone: log.customer.phone,
      whatsappOptIn: log.customer.whatsappOptIn,
    },
    phone: log.phone,
    message: log.message,
    waUrl: log.waUrl,
    status: log.status,
  };
}

function toSafeMessageLog(log: MessageLogWithRelations) {
  return {
    id: log.id,
    customer: {
      id: log.customer.id,
      name: log.customer.name,
      phone: log.customer.phone,
      whatsappOptIn: log.customer.whatsappOptIn,
    },
    template: log.template ? { id: log.template.id, name: log.template.name, type: log.template.type } : null,
    campaign: log.campaign ? { id: log.campaign.id, name: log.campaign.name } : null,
    visitId: log.visitId,
    phone: log.phone,
    message: log.message,
    waUrl: log.waUrl,
    status: log.status,
    openedBy: log.openedBy ? { id: log.openedBy.id, name: log.openedBy.name } : null,
    openedAt: log.openedAt?.toISOString() ?? null,
    markedSentBy: log.markedSentBy ? { id: log.markedSentBy.id, name: log.markedSentBy.name } : null,
    markedSentAt: log.markedSentAt?.toISOString() ?? null,
    skippedReason: log.skippedReason,
    createdAt: log.createdAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
  };
}

function buildVariables({
  customer,
  points,
  salonName,
  visit,
  campaign,
  managerReward,
  rewardDiscount,
}: {
  customer: Customer & { visits?: Array<{ visitedAt: Date }>; loyaltyAccount?: LoyaltyAccount | null };
  points: number;
  salonName: string;
  visit: { netAmount: Prisma.Decimal; pointsEarned: number } | null;
  campaign: Campaign | null;
  managerReward: { title: string; discountAmount: number; expiresAt: string | null } | null;
  rewardDiscount: number | "";
}) {
  const lastVisit = customer.lastVisitAt ?? customer.visits?.[0]?.visitedAt ?? null;
  return {
    name: customer.name,
    phone: customer.phone,
    points,
    reward_discount: rewardDiscount,
    manager_reward_title: managerReward?.title ?? "",
    manager_reward_discount: managerReward?.discountAmount ?? "",
    manager_reward_expires: managerReward?.expiresAt ? managerReward.expiresAt.slice(0, 10) : "",
    last_visit: lastVisit ? formatDate(lastVisit) : "",
    days_since_last_visit: lastVisit ? Math.max(0, Math.floor((Date.now() - lastVisit.getTime()) / (24 * 60 * 60 * 1000))) : "",
    campaign_name: campaign?.name ?? "",
    campaign_discount: campaign ? formatCampaignDiscount(campaign) : "",
    visit_net_amount: visit ? Number(visit.netAmount) : "",
    visit_points_earned: visit?.pointsEarned ?? "",
    salon_name: salonName,
  };
}

async function getBestAvailableReward(prisma: WhatsAppPrisma, points: number) {
  return prisma.rewardRule.findFirst({
    where: { isActive: true, requiredPoints: { lte: points } },
    orderBy: [{ requiredPoints: "desc" }, { discountAmount: "desc" }],
  });
}

async function isCampaignCustomerEligible(
  prisma: WhatsAppPrisma,
  campaign: Campaign,
  customer: Customer & { loyaltyAccount?: LoyaltyAccount | null },
  now: Date,
) {
  if (!campaign.isActive || campaign.startAt > now || campaign.endAt < now) return false;
  if (campaign.targetType === "NEW_CUSTOMERS" && customer.visitCount !== 0) return false;
  if (campaign.targetType === "CUSTOMERS_WITH_MIN_POINTS" && (customer.loyaltyAccount?.points ?? 0) < (campaign.minPoints ?? 0)) return false;
  if (campaign.targetType === "INACTIVE_CUSTOMERS") {
    if (customer.lastVisitAt) {
      const cutoff = new Date(now.getTime() - (campaign.inactiveDays ?? 0) * 24 * 60 * 60 * 1000);
      if (customer.lastVisitAt > cutoff) return false;
    }
  }
  const redemptionCount = await prisma.campaignRedemption.count({ where: { campaignId: campaign.id, customerId: customer.id } });
  return redemptionCount < campaign.maxUsesPerCustomer;
}

function toAudienceCustomer(customer: Customer & { loyaltyAccount?: LoyaltyAccount | null; managerRewards?: ManagerReward[] }, now: Date) {
  const managerReward = customer.managerRewards?.[0];
  return {
    customerId: customer.id,
    name: customer.name,
    phone: customer.phone,
    lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
    daysSinceLastVisit: customer.lastVisitAt ? Math.floor((now.getTime() - customer.lastVisitAt.getTime()) / (24 * 60 * 60 * 1000)) : null,
    points: customer.loyaltyAccount?.points ?? 0,
    isWhatsappAllowed: customer.whatsappOptIn,
    managerRewardTitle: managerReward?.title,
    managerRewardDiscount: managerReward ? Number(managerReward.discountAmount) : undefined,
    managerRewardExpiresAt: managerReward?.expiresAt?.toISOString() ?? null,
  };
}

function sanitizeMessageValue(value: unknown) {
  return String(value ?? "").replace(/[<>]/g, "").trim();
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatCampaignDiscount(campaign: Campaign) {
  if (campaign.discountType === "PERCENTAGE") return `${Number(campaign.discountValue)}%`;
  return `${Number(campaign.discountValue)} ريال`;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endExclusive(date: Date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}

const messageLogInclude = {
  customer: true,
  template: true,
  campaign: true,
  openedBy: true,
  markedSentBy: true,
} satisfies Prisma.WhatsAppMessageLogInclude;

type MessageLogWithRelations = WhatsAppMessageLog & {
  customer: Customer;
  template: { id: string; name: string; type: WhatsAppTemplateType } | null;
  campaign: { id: string; name: string } | null;
  openedBy: { id: string; name: string } | null;
  markedSentBy: { id: string; name: string } | null;
};
