import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  approvePaymentRequest,
  changeSubscriptionRenewal,
  requestSubscriptionPayment,
} from "../lib/billing/billing-service";
import { evaluateSubscription } from "../lib/plans/subscription-guard";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const organizationId = `org-billing-${suffix}`;
const planId = `plan-billing-${suffix}`;
const ownerId = `owner-billing-${suffix}`;

describe("دورة اشتراك المؤسسة", () => {
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { organizationId } });
    await prisma.billingInvoice.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("يحسب السعر في الخادم ثم لا يفعّل الباقة إلا بعد اعتماد المنصة", async () => {
    await prisma.plan.create({
      data: {
        id: planId,
        name: "باقة اختبار دورة الدفع",
        slug: `billing-${suffix}`,
        priceMonthly: 175,
        priceYearly: 1750,
        maxSalons: 2,
        maxBarbers: 10,
        isActive: true,
        isPublic: true,
      },
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "مؤسسة اختبار دورة الدفع",
        slug: `billing-org-${suffix}`,
        subscriptionStatus: "TRIALING",
      },
    });
    await prisma.user.create({
      data: {
        id: ownerId,
        organizationId,
        name: "مالك اختبار الدفع",
        phone: `05${Date.now().toString().slice(-8)}`,
        passwordHash: "test-hash",
        role: "OWNER",
      },
    });

    const requested = await requestSubscriptionPayment(prisma, {
      organizationId,
      planId,
      periodMonths: 12,
      reference: `REF-${suffix}`,
      actorType: "OWNER",
      actorUserId: ownerId,
    });

    expect(requested.status).toBe("PENDING");
    expect(requested.amount).toBe(1750);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })).planId).toBeNull();

    const approved = await approvePaymentRequest(prisma, requested.id, "test-platform-admin");
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    expect(approved.status).toBe("PAID");
    expect(approved.invoiceNumber).toMatch(/^XM-\d{4}-\d{6}$/);
    expect(organization.planId).toBe(planId);
    expect(organization.subscriptionStatus).toBe("ACTIVE");
    expect(organization.currentPeriodEnd).not.toBeNull();

    await changeSubscriptionRenewal(prisma, {
      organizationId,
      action: "CANCEL",
      actorType: "OWNER",
      actorUserId: ownerId,
    });
    const canceled = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    expect(canceled.subscriptionStatus).toBe("CANCELED");
    expect(evaluateSubscription(canceled).canOperate).toBe(true);
  });
});
