import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { getEffectiveSettings } from "@/lib/settings/system-settings";
import { listBookableSalons, listCustomerAppointments } from "@/lib/appointments/customer-booking";
import { toCustomerBookingPolicy } from "@/lib/appointments/booking-discipline";

/**
 * بوابة العميل: رابط سرّي يعرض للعميل رصيد نقاطه ومكافأته القادمة وسجل زياراته.
 *
 * الرمز نفسه هو السر (نمط magic link). لا نخزنه بصورته الأصلية، بل SHA-256 فقط،
 * وله عمر قصير قابل للضبط (30 يومًا افتراضيًا، 90 كحد أقصى).
 */
export function generatePortalToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashPortalToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function portalTokenExpiresAt(now = new Date()) {
  const configured = Number.parseInt(process.env.PORTAL_TOKEN_TTL_DAYS ?? "30", 10);
  const days = Number.isFinite(configured) ? Math.min(90, Math.max(1, configured)) : 30;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

async function issuePortalToken(prisma: PrismaClient, customerId: string) {
  const portalToken = generatePortalToken();
  const issuedAt = new Date();
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      portalTokenHash: hashPortalToken(portalToken),
      portalTokenIssuedAt: issuedAt,
      portalTokenExpiresAt: portalTokenExpiresAt(issuedAt),
    },
  });
  return portalToken;
}

/** يصدر رابطًا جديدًا؛ لا يمكن إعادة عرض الرمز القديم لأن قاعدة البيانات لا تحفظه. */
export async function ensurePortalToken(prisma: PrismaClient, customerId: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  });
  if (!customer) throw new BusinessError("العميل غير موجود", 404);
  return issuePortalToken(prisma, customer.id);
}

/** يبطل الرابط القديم ويصدر رمزًا جديدًا. */
export async function rotatePortalToken(prisma: PrismaClient, customerId: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  });
  if (!customer) throw new BusinessError("العميل غير موجود", 404);

  return issuePortalToken(prisma, customer.id);
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
    where: { portalTokenHash: hashPortalToken(token) },
    select: {
      id: true,
      name: true,
      phone: true,
      organizationId: true,
      portalTokenExpiresAt: true,
      organization: { select: { id: true, status: true } },
    },
  });

  if (!customer || !customer.portalTokenExpiresAt || customer.portalTokenExpiresAt <= new Date()) return null;
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
    where: { portalTokenHash: hashPortalToken(token) },
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
      dataSubjectRequests: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, type: true, status: true, createdAt: true, identityVerifiedAt: true, executedAt: true },
      },
    },
  });

  if (!customer || !customer.portalTokenExpiresAt || customer.portalTokenExpiresAt <= new Date()) return null;
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
    /** معدّل الكسب — يشرح للعميل معنى الرقم بدل أن يراه رصيدًا مجرّدًا. */
    pointsPerRiyal: settings ? Number(settings.pointsPerCurrencyUnit) : 1,
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
    dataSubjectRequests: customer.dataSubjectRequests.map((request) => ({
      id: request.id,
      type: request.type,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      identityVerifiedAt: request.identityVerifiedAt?.toISOString() ?? null,
      executedAt: request.executedAt?.toISOString() ?? null,
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
    /** سياسة عدم الحضور تُعرض قبل الحجز، والحظر نفسه مفروض مرة أخرى في الخادم. */
    bookingPolicy: toCustomerBookingPolicy(customer),
    /** الفروع التي فعّلت الحجز الذاتي. فارغة = لا يُعرض قسم الحجز إطلاقًا. */
    bookableSalons,
  };
}
