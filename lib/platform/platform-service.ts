import type { OrganizationStatus, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";

export async function listOrganizations(prisma: PrismaClient) {
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      plan: { select: { id: true, name: true, maxSalons: true } },
      _count: { select: { salons: true, users: true, barbers: true, customers: true } },
    },
  });
  return organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    subscriptionStatus: org.subscriptionStatus,
    plan: org.plan ? { id: org.plan.id, name: org.plan.name, maxSalons: org.plan.maxSalons } : null,
    trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
    counts: org._count,
    createdAt: org.createdAt.toISOString(),
  }));
}

export async function updateOrganizationByPlatform(
  prisma: PrismaClient,
  organizationId: string,
  input: { status?: OrganizationStatus; planId?: string | null; subscriptionStatus?: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" },
) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
  if (!org) throw new BusinessError("المؤسسة غير موجودة");

  if (input.planId) {
    const plan = await prisma.plan.findUnique({ where: { id: input.planId }, select: { id: true } });
    if (!plan) throw new BusinessError("الباقة غير موجودة");
  }

  return prisma.organization.update({
    where: { id: organizationId },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.planId !== undefined ? { planId: input.planId } : {}),
      ...(input.subscriptionStatus ? { subscriptionStatus: input.subscriptionStatus } : {}),
    },
  });
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
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    organizationsCount: plan._count.organizations,
  }));
}

export async function createPlan(
  prisma: PrismaClient,
  input: { name: string; slug: string; priceMonthly: number; maxSalons: number; maxBarbers?: number | null; sortOrder?: number },
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
      sortOrder: input.sortOrder ?? 0,
      isActive: true,
    },
  });
}

export async function updatePlan(
  prisma: PrismaClient,
  planId: string,
  input: { name?: string; priceMonthly?: number; maxSalons?: number; maxBarbers?: number | null; isActive?: boolean; sortOrder?: number },
) {
  const plan = await prisma.plan.findUnique({ where: { id: planId }, select: { id: true } });
  if (!plan) throw new BusinessError("الباقة غير موجودة");
  return prisma.plan.update({ where: { id: planId }, data: input });
}
