import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { getEffectiveSettings } from "@/lib/settings/system-settings";
import { hashPortalToken } from "@/lib/customers/customer-portal";
import { toCustomerBookingPolicy } from "@/lib/appointments/booking-discipline";
import { listBookableSalons, listCustomerAppointments } from "@/lib/appointments/customer-booking";
import { onlyActiveServices } from "@/lib/services/service-summary";

/**
 * محمّلات بوابة العميل، **واحد لكل تبويب**.
 *
 * كانت دالة واحدة تجلب كل شيء: النقاط والمكافآت والزيارات وطلبات الخصوصية
 * والمواعيد **و`listBookableSalons`** — وهذه الأخيرة تدور على الفروع وتنفّذ ثلاثة
 * استعلامات لكل فرع. مع تقسيم الصفحة إلى تبويبات صار ذلك يعني تنفيذها كاملةً
 * لمن يفتح «زياراتي»، فقُسّمت: كل تبويب يجلب ما يعرضه لا أكثر.
 *
 * **`getPortalIdentity` محفوظة بـ `cache` من React** كما `getRequestSession`:
 * التخطيط يقرأ الاسم والعلامة، والصفحة تقرأ المؤسسة والإعدادات، وكلاهما في
 * الطلب نفسه. النطاق طلب واحد فلا يتسرّب رمز عميل إلى طلب آخر.
 */

export type PortalIdentity = NonNullable<Awaited<ReturnType<typeof getPortalIdentity>>>;

export const getPortalIdentity = cache(async (token: string) => {
  // الرمز القصير يُرفض قبل لمس القاعدة — لا فائدة من تجزئة نص من خمسة أحرف.
  if (!token || token.length < 16) return null;

  const customer = await prisma.customer.findUnique({
    where: { portalTokenHash: hashPortalToken(token) },
    select: {
      id: true,
      name: true,
      phone: true,
      organizationId: true,
      visitCount: true,
      lastVisitAt: true,
      portalTokenExpiresAt: true,
      accountId: true,
      bookingNoShowCount: true,
      bookingBlockedAt: true,
      bookingBlockReason: true,
      loyaltyAccount: { select: { points: true, lifetimeEarned: true } },
      organization: { select: { id: true, name: true, status: true } },
    },
  });

  if (!customer || !customer.portalTokenExpiresAt || customer.portalTokenExpiresAt <= new Date()) return null;
  // مؤسسة موقوفة لا تعرض بوابة عملاء.
  if (customer.organization?.status === "SUSPENDED") return null;

  const settings = await getEffectiveSettings(prisma, { organizationId: customer.organizationId });

  return {
    token,
    organizationId: customer.organizationId,
    brandName: settings?.legalName?.trim() || settings?.salonName || customer.organization?.name || "",
    customer: { id: customer.id, name: customer.name, phone: customer.phone },
    /**
     * هل لهذه البطاقة حساب موحّد؟ من انضم من `/join` له حساب، ومن سجّله الحلاق
     * على الكرسي لا. الفرق يحكم عرضَ رابط «حسابي على المنصّة» في تبويب حسابي:
     * إرساله لمن لا حساب له يقوده إلى شاشة دخول لا يملك بيانات دخولها.
     */
    hasUnifiedAccount: Boolean(customer.accountId),
    points: customer.loyaltyAccount?.points ?? 0,
    lifetimeEarned: customer.loyaltyAccount?.lifetimeEarned ?? 0,
    visitCount: customer.visitCount,
    lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
    pointsPerRiyal: settings ? Number(settings.pointsPerCurrencyUnit) : 1,
    /** إرشاد عرضٍ لا قيد — صفر يعني ألا يُعرض إطلاقًا. */
    arriveEarlyMinutes: settings?.bookingArriveEarlyMinutes ?? 0,
    bookingPolicy: toCustomerBookingPolicy(customer),
  };
});

/** ملخّص أقرب موعد قادم — يُعرض في ترويسة البطاقة، فهو أهم حقيقة لمن له موعد. */
export async function getNextAppointment(identity: PortalIdentity) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      organizationId: identity.organizationId,
      customerId: identity.customer.id,
      status: { in: ["BOOKED", "ARRIVED"] },
      startAt: { gte: new Date() },
    },
    orderBy: { startAt: "asc" },
    select: {
      id: true,
      startAt: true,
      durationMinutes: true,
      status: true,
      barber: { select: { name: true } },
      salon: { select: { name: true } },
      services: { select: { serviceName: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!appointment) return null;

  return {
    id: appointment.id,
    startAt: appointment.startAt.toISOString(),
    durationMinutes: appointment.durationMinutes,
    arrived: appointment.status === "ARRIVED",
    barberName: appointment.barber?.name ?? null,
    salonName: appointment.salon?.name ?? null,
    services: appointment.services.map((service) => service.serviceName),
  };
}

/** تبويب «بطاقتي»: الرصيد والمكافأة القادمة والموعد الأقرب. */
export async function getPortalCard(identity: PortalIdentity) {
  const [rewardRules, nextAppointment] = await Promise.all([
    prisma.rewardRule.findMany({
      where: { organizationId: identity.organizationId, isActive: true },
      orderBy: { requiredPoints: "asc" },
    }),
    getNextAppointment(identity),
  ]);

  const nextReward = rewardRules.find((rule) => rule.requiredPoints > identity.points) ?? null;

  return {
    nextAppointment,
    unlockedCount: rewardRules.filter((rule) => rule.requiredPoints <= identity.points).length,
    nextReward: nextReward
      ? {
          name: nextReward.name,
          requiredPoints: nextReward.requiredPoints,
          discountAmount: Number(nextReward.discountAmount),
          pointsRemaining: nextReward.requiredPoints - identity.points,
          progress: Math.min(100, Math.round((identity.points / nextReward.requiredPoints) * 100)),
        }
      : null,
  };
}

/** تبويب «مواعيدي»: الحجوزات وفروع الحجز الذاتي. */
export async function getPortalBooking(identity: PortalIdentity) {
  const [appointments, bookableSalons] = await Promise.all([
    listCustomerAppointments(prisma, {
      organizationId: identity.organizationId,
      customerId: identity.customer.id,
    }),
    listBookableSalons(prisma, identity.organizationId),
  ]);

  return { appointments, bookableSalons };
}

export type PortalOffers = Awaited<ReturnType<typeof getPortalOffers>>;

/**
 * تبويب «العروض»: منيو الصالون + كل ما يستحقه العميل في مكان واحد.
 *
 * المنيو لا يُقيَّد بـ `bookingEnabled`: قائمة الأسعار معلومة يستحقها كل عميل
 * حتى في فرع لا يقبل الحجز الذاتي.
 */
export async function getPortalOffers(identity: PortalIdentity) {
  const now = new Date();
  const [salons, rewardRules, managerRewards] = await Promise.all([
    prisma.salon.findMany({
      where: { organizationId: identity.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        services: {
          where: { isActive: true },
          select: { id: true, name: true, durationMinutes: true, defaultPrice: true, sortOrder: true, isActive: true },
        },
      },
    }),
    prisma.rewardRule.findMany({
      where: { organizationId: identity.organizationId, isActive: true },
      orderBy: { requiredPoints: "asc" },
    }),
    prisma.managerReward.findMany({
      where: { customerId: identity.customer.id, redeemedAt: null, revokedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    menus: salons
      .map((salon) => ({
        id: salon.id,
        name: salon.name,
        services: onlyActiveServices(salon.services).map((service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          price: Number(service.defaultPrice),
        })),
      }))
      // فرع بلا خدمة نشطة لوحٌ فارغ بعنوان — يُحذف لا يُعرض.
      .filter((salon) => salon.services.length > 0),
    rewards: rewardRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      requiredPoints: rule.requiredPoints,
      discountAmount: Number(rule.discountAmount),
      unlocked: rule.requiredPoints <= identity.points,
      pointsRemaining: Math.max(0, rule.requiredPoints - identity.points),
    })),
    gifts: managerRewards
      .filter((reward) => !reward.expiresAt || reward.expiresAt > now)
      .map((reward) => ({
        id: reward.id,
        title: reward.title,
        description: reward.description,
        discountAmount: Number(reward.discountAmount),
        expiresAt: reward.expiresAt?.toISOString() ?? null,
      })),
  };
}

/**
 * تبويب «حسابي»: طلبات الخصوصية القائمة وحدها.
 *
 * منفصلة عن `getPortalVisits` عمدًا: تبويب «بطاقتي» كان يستدعي تلك ليقرأ منها
 * `dataSubjectRequests` فيجلب معها عشر زيارات بثلاثة `include` **لا يعرضها**.
 */
export async function getPortalAccount(identity: PortalIdentity) {
  const dataSubjectRequests = await prisma.dataSubjectRequest.findMany({
    where: { customerId: identity.customer.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, type: true, status: true, createdAt: true, identityVerifiedAt: true, executedAt: true },
  });

  return {
    dataSubjectRequests: dataSubjectRequests.map((request) => ({
      id: request.id,
      type: request.type,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      identityVerifiedAt: request.identityVerifiedAt?.toISOString() ?? null,
      executedAt: request.executedAt?.toISOString() ?? null,
    })),
  };
}

/**
 * تبويب «زياراتي»: آخر الزيارات **وحركة النقاط**.
 *
 * الرصيد بلا سجل رقمٌ يُطلب تصديقه: «كيف صار رصيدي ٣٤٠؟» لم يكن له جواب في
 * البوابة إطلاقًا — الاستبدال والتسوية والعكس والانتهاء لا يظهر منها شيء، وقائمة
 * الزيارات تُظهر المكتسب وحده. السجل موجود أصلًا في `LoyaltyTransaction` ويُعرض
 * كاملًا في محفظة الحساب؛ هذه تعرض آخر عشر حركات في مكان الرصيد نفسه.
 */
export async function getPortalVisits(identity: PortalIdentity) {
  const [visits, dataSubjectRequests, movements] = await Promise.all([
    prisma.visit.findMany({
      where: { customerId: identity.customer.id, status: "COMPLETED" },
      orderBy: { visitedAt: "desc" },
      take: 10,
      select: {
        id: true,
        visitedAt: true,
        netAmount: true,
        pointsEarned: true,
        salon: { select: { name: true } },
        services: { select: { serviceName: true } },
      },
    }),
    prisma.dataSubjectRequest.findMany({
      where: { customerId: identity.customer.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, type: true, status: true, createdAt: true, identityVerifiedAt: true, executedAt: true },
    }),
    prisma.loyaltyTransaction.findMany({
      where: { customerId: identity.customer.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, type: true, points: true, balanceAfter: true, createdAt: true },
    }),
  ]);

  return {
    pointsMovements: movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      points: movement.points,
      balanceAfter: movement.balanceAfter,
      createdAt: movement.createdAt.toISOString(),
    })),
    recentVisits: visits.map((visit) => ({
      id: visit.id,
      visitedAt: visit.visitedAt.toISOString(),
      salonName: visit.salon?.name ?? "",
      services: visit.services.map((service) => service.serviceName),
      netAmount: Number(visit.netAmount),
      pointsEarned: visit.pointsEarned,
    })),
    dataSubjectRequests: dataSubjectRequests.map((request) => ({
      id: request.id,
      type: request.type,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      identityVerifiedAt: request.identityVerifiedAt?.toISOString() ?? null,
      executedAt: request.executedAt?.toISOString() ?? null,
    })),
  };
}
