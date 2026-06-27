import { randomInt } from "node:crypto";
import type { OrganizationStatus, Prisma, PrismaClient, SubscriptionStatus } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { hashAdminPassword } from "@/lib/auth/password";
import { hashBarberPin } from "@/lib/auth/barber-pin";

const PAGE_SIZE = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

// كلمة مرور مؤقتة قابلة للقراءة بدون أحرف ملتبسة (0/O/1/l/I).
function generateTempPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set: string) => set[randomInt(set.length)];
  const core = Array.from({ length: 7 }, () => pick(all)).join("");
  return `Tnl-${pick(upper)}${core}${pick(digits)}`;
}

function generateTempPin() {
  return String(randomInt(1000, 10000));
}

const orgInclude = {
  plan: { select: { id: true, name: true, maxSalons: true, maxBarbers: true, maxCustomers: true, priceMonthly: true } },
  _count: { select: { salons: true, users: true, barbers: true, customers: true } },
} satisfies Prisma.OrganizationInclude;

type OrgWithInclude = Prisma.OrganizationGetPayload<{ include: typeof orgInclude }>;

function toOrgRow(org: OrgWithInclude) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    subscriptionStatus: org.subscriptionStatus,
    plan: org.plan
      ? { id: org.plan.id, name: org.plan.name, maxSalons: org.plan.maxSalons, maxBarbers: org.plan.maxBarbers, maxCustomers: org.plan.maxCustomers }
      : null,
    trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
    counts: org._count,
    createdAt: org.createdAt.toISOString(),
  };
}

export async function listOrganizations(
  prisma: PrismaClient,
  filters: { q?: string; status?: OrganizationStatus; planId?: string; page?: number } = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const where: Prisma.OrganizationWhereInput = {
    ...(filters.q
      ? { OR: [{ name: { contains: filters.q, mode: "insensitive" } }, { slug: { contains: filters.q.toLowerCase() } }] }
      : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.planId ? { planId: filters.planId } : {}),
  };

  const [total, organizations] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: orgInclude,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return {
    rows: organizations.map(toOrgRow),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getPlatformOverview(prisma: PrismaClient) {
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [totalOrgs, activeOrgs, suspendedOrgs, trialingOrgs, salons, barbers, customers, payingOrgs, expiringTrials, recentOrgs] =
    await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { status: "ACTIVE" } }),
      prisma.organization.count({ where: { status: "SUSPENDED" } }),
      prisma.organization.count({ where: { subscriptionStatus: "TRIALING" } }),
      prisma.salon.count(),
      prisma.barber.count(),
      prisma.customer.count(),
      prisma.organization.findMany({
        where: { status: "ACTIVE", subscriptionStatus: "ACTIVE", plan: { isNot: null } },
        select: { plan: { select: { priceMonthly: true } } },
      }),
      prisma.organization.findMany({
        where: { subscriptionStatus: "TRIALING", trialEndsAt: { not: null, lte: soon } },
        orderBy: { trialEndsAt: "asc" },
        take: 10,
        select: { id: true, name: true, slug: true, trialEndsAt: true },
      }),
      prisma.organization.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: orgInclude }),
    ]);

  const estimatedMrr = payingOrgs.reduce((total, org) => total + Number(org.plan?.priceMonthly ?? 0), 0);

  return {
    totals: { organizations: totalOrgs, active: activeOrgs, suspended: suspendedOrgs, trialing: trialingOrgs, salons, barbers, customers },
    estimatedMrr,
    expiringTrials: expiringTrials.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
      daysLeft: org.trialEndsAt ? Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null,
    })),
    recentOrganizations: recentOrgs.map(toOrgRow),
  };
}

export async function updateOrganizationByPlatform(
  prisma: PrismaClient,
  organizationId: string,
  input: {
    status?: OrganizationStatus;
    planId?: string | null;
    subscriptionStatus?: SubscriptionStatus;
    trialEndsAt?: string | null;
    currentPeriodEnd?: string | null;
    extendTrialDays?: number;
    extendPeriodDays?: number;
  },
) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, trialEndsAt: true, currentPeriodEnd: true },
  });
  if (!org) throw new BusinessError("المؤسسة غير موجودة");

  if (input.planId) {
    const plan = await prisma.plan.findUnique({ where: { id: input.planId }, select: { id: true } });
    if (!plan) throw new BusinessError("الباقة غير موجودة");
  }

  const now = new Date();

  let trialEndsAt: Date | null | undefined;
  if (input.extendTrialDays && input.extendTrialDays > 0) {
    const base = org.trialEndsAt && org.trialEndsAt > now ? org.trialEndsAt : now;
    trialEndsAt = new Date(base.getTime() + input.extendTrialDays * DAY_MS);
  } else if (input.trialEndsAt !== undefined) {
    trialEndsAt = input.trialEndsAt ? new Date(input.trialEndsAt) : null;
  }

  let currentPeriodEnd: Date | null | undefined;
  if (input.extendPeriodDays && input.extendPeriodDays > 0) {
    const base = org.currentPeriodEnd && org.currentPeriodEnd > now ? org.currentPeriodEnd : now;
    currentPeriodEnd = new Date(base.getTime() + input.extendPeriodDays * DAY_MS);
  } else if (input.currentPeriodEnd !== undefined) {
    currentPeriodEnd = input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null;
  }

  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.planId !== undefined ? { planId: input.planId } : {}),
      ...(input.subscriptionStatus ? { subscriptionStatus: input.subscriptionStatus } : {}),
      ...(trialEndsAt !== undefined ? { trialEndsAt } : {}),
      ...(currentPeriodEnd !== undefined ? { currentPeriodEnd } : {}),
    },
  });

  return {
    id: updated.id,
    status: updated.status,
    planId: updated.planId,
    subscriptionStatus: updated.subscriptionStatus,
    trialEndsAt: updated.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: updated.currentPeriodEnd?.toISOString() ?? null,
  };
}

export async function listPlans(prisma: PrismaClient) {
  const plans = await prisma.plan.findMany({
    orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
    include: { _count: { select: { organizations: true } } },
  });
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    priceMonthly: Number(plan.priceMonthly),
    maxSalons: plan.maxSalons,
    maxBarbers: plan.maxBarbers,
    maxCustomers: plan.maxCustomers,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    organizationsCount: plan._count.organizations,
  }));
}

export async function createPlan(
  prisma: PrismaClient,
  input: { name: string; slug: string; priceMonthly: number; maxSalons: number; maxBarbers?: number | null; maxCustomers?: number | null; sortOrder?: number },
) {
  const duplicate = await prisma.plan.findFirst({
    where: { OR: [{ slug: input.slug }, { name: input.name }] },
    select: { id: true },
  });
  if (duplicate) throw new BusinessError("اسم أو معرّف الباقة مستخدم مسبقًا");

  return prisma.plan.create({
    data: {
      name: input.name,
      slug: input.slug,
      priceMonthly: input.priceMonthly,
      maxSalons: input.maxSalons,
      maxBarbers: input.maxBarbers ?? null,
      maxCustomers: input.maxCustomers ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: true,
    },
  });
}

export async function updatePlan(
  prisma: PrismaClient,
  planId: string,
  input: { name?: string; priceMonthly?: number; maxSalons?: number; maxBarbers?: number | null; maxCustomers?: number | null; isActive?: boolean; sortOrder?: number },
) {
  const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!plan) throw new BusinessError("الباقة غير موجودة");
  return prisma.plan.update({ where: { id: planId }, data: input });
}

export async function getOrganizationDetail(prisma: PrismaClient, organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      plan: true,
      salons: { orderBy: { createdAt: "asc" }, include: { _count: { select: { barbers: true } } } },
      users: {
        where: { role: { in: ["OWNER", "ADMIN", "SUPERVISOR"] } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, email: true, phone: true, role: true, isActive: true, lastLoginAt: true },
      },
      barbers: {
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        select: { id: true, name: true, phone: true, isActive: true, lastLoginAt: true, salon: { select: { name: true } } },
      },
      _count: { select: { salons: true, barbers: true, customers: true, visits: true } },
    },
  });
  if (!org) return null;

  const recentAudit = await prisma.auditLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { id: true, action: true, entityType: true, actorType: true, createdAt: true },
  });

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
    createdAt: org.createdAt.toISOString(),
    plan: org.plan
      ? {
          id: org.plan.id,
          name: org.plan.name,
          priceMonthly: Number(org.plan.priceMonthly),
          maxSalons: org.plan.maxSalons,
          maxBarbers: org.plan.maxBarbers,
          maxCustomers: org.plan.maxCustomers,
        }
      : null,
    usage: { salons: org._count.salons, barbers: org._count.barbers, customers: org._count.customers, visits: org._count.visits },
    salons: org.salons.map((salon) => ({
      id: salon.id,
      name: salon.name,
      slug: salon.slug,
      isActive: salon.isActive,
      barbersCount: salon._count.barbers,
    })),
    members: org.users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    })),
    barbers: org.barbers.map((barber) => ({
      id: barber.id,
      name: barber.name,
      phone: barber.phone,
      salonName: barber.salon?.name ?? null,
      isActive: barber.isActive,
      lastLoginAt: barber.lastLoginAt?.toISOString() ?? null,
    })),
    recentAudit: recentAudit.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      actorType: log.actorType,
      createdAt: log.createdAt.toISOString(),
    })),
  };
}

/** يعيّن كلمة مرور مؤقتة لعضو إدارة في مؤسسة، ويعيدها مرة واحدة لمدير المنصّة. */
export async function resetMemberPassword(prisma: PrismaClient, organizationId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new BusinessError("العضو غير موجود في هذه المؤسسة");

  const password = generateTempPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashAdminPassword(password) },
  });

  return { id: user.id, name: user.name, email: user.email, password };
}

/** يعيّن رمز دخول مؤقت لحلاق في مؤسسة، ويعيده مرة واحدة لمدير المنصّة. */
export async function resetBarberPin(prisma: PrismaClient, organizationId: string, barberId: string) {
  const barber = await prisma.barber.findFirst({
    where: { id: barberId, organizationId },
    select: { id: true, name: true, phone: true },
  });
  if (!barber) throw new BusinessError("الحلاق غير موجود في هذه المؤسسة");

  const pin = generateTempPin();
  await prisma.barber.update({
    where: { id: barber.id },
    data: { accessPinHash: await hashBarberPin(pin) },
  });

  return { id: barber.id, name: barber.name, phone: barber.phone, pin };
}
