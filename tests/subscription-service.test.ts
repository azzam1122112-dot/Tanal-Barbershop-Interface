import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createOrganizationWithOwner } from "../lib/organizations/organization-service";
import { getOrganizationSubscriptionOverview } from "../lib/plans/subscription-service";

const prisma = new PrismaClient();

const createdOrgIds: string[] = [];
const createdPlanIds: string[] = [];

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("subscription plans", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    await prisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } });
    await prisma.$disconnect();
  });

  it("assigns self-signups to the active free plan from platform plans", async () => {
    const paidPlan = await prisma.plan.create({
      data: {
        name: unique("مدفوعة"),
        slug: unique("paid"),
        priceMonthly: 199,
        maxSalons: 9,
        sortOrder: -100,
        isActive: true,
      },
    });
    const freePlan = await prisma.plan.create({
      data: {
        name: unique("مجانية"),
        slug: unique("free"),
        priceMonthly: 0,
        maxSalons: 1,
        maxBarbers: 2,
        maxCustomers: 50,
        sortOrder: -50,
        isActive: true,
      },
    });
    createdPlanIds.push(paidPlan.id, freePlan.id);

    const result = await createOrganizationWithOwner(prisma, {
      organizationName: "مؤسسة اختبار الباقة",
      slug: unique("org-plan"),
      salonName: "الفرع الرئيسي",
      ownerName: "مالك الاختبار",
      email: `${unique("owner")}@example.com`,
      phone: "0501234567",
      password: "StrongPass123!",
    });
    createdOrgIds.push(result.organization.id);

    expect(result.organization.planId).toBe(freePlan.id);
  });

  it("returns current plan usage and active upgrade plans for the dashboard", async () => {
    const freePlan = await prisma.plan.create({
      data: {
        name: unique("باقة عميل مجانية"),
        slug: unique("customer-free"),
        priceMonthly: 0,
        maxSalons: 1,
        maxBarbers: 1,
        maxCustomers: 25,
        sortOrder: -40,
        isActive: true,
      },
    });
    const upgradePlan = await prisma.plan.create({
      data: {
        name: unique("باقة ترقية"),
        slug: unique("upgrade"),
        priceMonthly: 99,
        maxSalons: 3,
        maxBarbers: null,
        maxCustomers: null,
        sortOrder: -30,
        isActive: true,
      },
    });
    const inactivePlan = await prisma.plan.create({
      data: {
        name: unique("باقة مخفية"),
        slug: unique("hidden"),
        priceMonthly: 299,
        maxSalons: 10,
        sortOrder: -20,
        isActive: false,
      },
    });
    createdPlanIds.push(freePlan.id, upgradePlan.id, inactivePlan.id);

    const org = await prisma.organization.create({
      data: {
        name: "مؤسسة ملخص الاشتراك",
        slug: unique("subscription-org"),
        planId: freePlan.id,
        subscriptionStatus: "TRIALING",
      },
    });
    createdOrgIds.push(org.id);

    const salon = await prisma.salon.create({
      data: { organizationId: org.id, name: "فرع", slug: "main" },
    });
    await prisma.barber.create({
      data: {
        organizationId: org.id,
        salonId: salon.id,
        name: "حلاق",
        phone: "0507654321",
        accessPinHash: "hash",
      },
    });

    const overview = await getOrganizationSubscriptionOverview(prisma, org.id);

    expect(overview?.organization.plan?.id).toBe(freePlan.id);
    expect(overview?.organization.plan?.maxCustomers).toBe(25);
    expect(overview?.organization.usage.salons).toBe(1);
    expect(overview?.organization.usage.barbers).toBe(1);
    expect(overview?.plans.map((plan) => plan.id)).toContain(upgradePlan.id);
    expect(overview?.plans.map((plan) => plan.id)).not.toContain(inactivePlan.id);
  });
});
