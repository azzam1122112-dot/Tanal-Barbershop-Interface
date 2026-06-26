import type { PrismaClient } from "@prisma/client";

export type PlanSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number;
  maxSalons: number;
  maxBarbers: number | null;
  maxCustomers: number | null;
  isActive: boolean;
  sortOrder: number;
};

function toPlanSummary(plan: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: { toString(): string };
  maxSalons: number;
  maxBarbers: number | null;
  maxCustomers: number | null;
  isActive: boolean;
  sortOrder: number;
}): PlanSummary {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    priceMonthly: Number(plan.priceMonthly),
    maxSalons: plan.maxSalons,
    maxBarbers: plan.maxBarbers,
    maxCustomers: plan.maxCustomers,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
  };
}

export async function getDefaultSignupPlan(prisma: PrismaClient) {
  return prisma.plan.findFirst({
    where: { isActive: true, priceMonthly: 0 },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function listActivePlansForUpgrade(prisma: PrismaClient) {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }, { createdAt: "asc" }],
  });
  return plans.map(toPlanSummary);
}

export async function getOrganizationSubscriptionOverview(prisma: PrismaClient, organizationId: string) {
  const [organization, plans] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        plan: true,
        _count: { select: { salons: true, barbers: true, customers: true } },
      },
    }),
    listActivePlansForUpgrade(prisma),
  ]);

  if (!organization) return null;

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      subscriptionStatus: organization.subscriptionStatus,
      trialEndsAt: organization.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: organization.currentPeriodEnd?.toISOString() ?? null,
      plan: organization.plan ? toPlanSummary(organization.plan) : null,
      usage: {
        salons: organization._count.salons,
        barbers: organization._count.barbers,
        customers: organization._count.customers,
      },
    },
    plans,
  };
}
