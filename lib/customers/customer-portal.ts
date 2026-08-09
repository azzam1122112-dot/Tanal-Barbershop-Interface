import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { getEffectiveSettings } from "@/lib/settings/system-settings";
import { listBookableSalons, listCustomerAppointments } from "@/lib/appointments/customer-booking";

/**
 * بوابة العميل: رابط سرّي يعرض للعميل رصيد نقاطه ومكافأته القادمة وسجل زياراته.
 *
 * الرمز نفسه هو السر (نمط magic link) — لا يكشف إلا بيانات هذا العميل،
 * وقابل للتدوير من لوحة الإدارة إن تسرّب الرابط.
 */
export function generatePortalToken() {
  return crypto.randomBytes(24).toString("base64url");
}

/** يعيد رمز العميل، ويولّده عند أول طلب. */
export async function ensurePortalToken(prisma: PrismaClient, customerId: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true, portalToken: true },
  });
  if (!customer) throw new BusinessError("العميل غير موجود", 404);
  if (customer.portalToken) return customer.portalToken;

  const portalToken = generatePortalToken();
  await prisma.customer.update({ where: { id: customer.id }, data: { portalToken } });
  return portalToken;
}

/** يبطل الرابط القديم ويصدر رمزًا جديدًا. */
export async function rotatePortalToken(prisma: PrismaClient, customerId: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  });
  if (!customer) throw new BusinessError("العميل غير موجود", 404);

  const portalToken = generatePortalToken();
  await prisma.customer.update({ where: { id: customer.id }, data: { portalToken } });
  return portalToken;
}

/**
 * يحلّ العميل من رمز بوابته — **بوابة الهوية الوحيدة** لكل مسارات البوابة العامة.
 *
 * الرمز نفسه هو السر، فأي مسار يقبله لازم يمر من هنا لا أن يستعلم بنفسه:
 * الفحوص الثلاثة (طول الرمز، وجود المؤسسة، عدم إيقافها) في موضع واحد
 * فلا ينسى مسارٌ أحدَها لاحقًا.
 */
export async function resolveCustomerByPortalToken(prisma: PrismaClient, token: string) {
  if (!token || token.length < 16) return null;

  const customer = await prisma.customer.findUnique({
    where: { portalToken: token },
    select: {
      id: true,
      name: true,
      phone: true,
      organizationId: true,
      organization: { select: { id: true, status: true } },
    },
  });

  if (!customer || !customer.organizationId) return null;
  if (customer.organization?.status === "SUSPENDED") return null;

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    organizationId: customer.organizationId,
  };
}

export type CustomerPortalView = NonNullable<Awaited<ReturnType<typeof getCustomerPortalView>>>;

/** يبني ما يراه العميل. لا يكشف أي بيانات تشغيلية أو مالية للمنشأة. */
export async function getCustomerPortalView(prisma: PrismaClient, token: string) {
  if (!token || token.length < 16) return null;

  const customer = await prisma.customer.findUnique({
    where: { portalToken: token },
    include: {
      loyaltyAccount: true,
      organization: { select: { id: true, name: true, status: true } },
      visits: {
        where: { status: "COMPLETED" },
        orderBy: { visitedAt: "desc" },
        take: 10,
        include: { services: { select: { serviceName: true } }, salon: { select: { name: true } } },
      },
      managerRewards: {
        where: { redeemedAt: null, revokedAt: null },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!customer || !customer.organizationId) return null;
  // مؤسسة موقوفة لا تعرض بوابة عملاء.
  if (customer.organization?.status === "SUSPENDED") return null;

  const points = customer.loyaltyAccount?.points ?? 0;
  const [rewardRules, settings] = await Promise.all([
    prisma.rewardRule.findMany({
      where: { organizationId: customer.organizationId, isActive: true },
      orderBy: { requiredPoints: "asc" },
    }),
    getEffectiveSettings(prisma, { organizationId: customer.organizationId }),
  ]);

  const unlocked = rewardRules.filter((rule) => rule.requiredPoints <= points);
  const nextReward = rewardRules.find((rule) => rule.requiredPoints > points) ?? null;
  const now = new Date();

  const [appointments, bookableSalons] = await Promise.all([
    listCustomerAppointments(prisma, { organizationId: customer.organizationId, customerId: customer.id }),
    listBookableSalons(prisma, customer.organizationId),
  ]);

  return {
    brandName: settings?.legalName?.trim() || settings?.salonName || customer.organization?.name || "",
    customer: { name: customer.name, phone: customer.phone },
    points,
    lifetimeEarned: customer.loyaltyAccount?.lifetimeEarned ?? 0,
    visitCount: customer.visitCount,
    lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
    unlockedRewards: unlocked.map((rule) => ({
      id: rule.id,
      name: rule.name,
      requiredPoints: rule.requiredPoints,
      discountAmount: Number(rule.discountAmount),
    })),
    nextReward: nextReward
      ? {
          name: nextReward.name,
          requiredPoints: nextReward.requiredPoints,
          discountAmount: Number(nextReward.discountAmount),
          pointsRemaining: nextReward.requiredPoints - points,
          progress: Math.min(100, Math.round((points / nextReward.requiredPoints) * 100)),
        }
      : null,
    managerRewards: customer.managerRewards
      .filter((reward) => !reward.expiresAt || reward.expiresAt > now)
      .map((reward) => ({
        id: reward.id,
        title: reward.title,
        description: reward.description,
        discountAmount: Number(reward.discountAmount),
        expiresAt: reward.expiresAt?.toISOString() ?? null,
      })),
    recentVisits: customer.visits.map((visit) => ({
      id: visit.id,
      visitedAt: visit.visitedAt.toISOString(),
      salonName: visit.salon?.name ?? "",
      services: visit.services.map((service) => service.serviceName),
      netAmount: Number(visit.netAmount),
      pointsEarned: visit.pointsEarned,
    })),
    /** مواعيد العميل من أمس فصاعدًا — القادمة أولًا. */
    appointments,
    /** الفروع التي فعّلت الحجز الذاتي. فارغة = لا يُعرض قسم الحجز إطلاقًا. */
    bookableSalons,
  };
}
