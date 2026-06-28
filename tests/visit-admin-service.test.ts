import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { canAccessDashboard } from "../lib/auth/access";
import { visitAmountUpdateSchema, visitCancelSchema, visitPaymentMethodUpdateSchema } from "../lib/auth/validation";
import { closeCashSession, openCashSession } from "../lib/cash-sessions/cash-session-service";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { normalizeCloseDate } from "../lib/daily-close/daily-close-service";
import { getRevenueReport } from "../lib/reports/dashboard-reports";
import { cancelVisit, updateVisitAmount, updateVisitPaymentMethod } from "../lib/visits/visit-admin-service";
import { confirmVisit } from "../lib/visits/visit-service";

const prisma = new PrismaClient();
const createdCustomerIds: string[] = [];
const createdServiceIds: string[] = [];
const createdVisitIds: string[] = [];
const createdCampaignIds: string[] = [];
const createdBarberIds: string[] = [];
const createdCloseIds: string[] = [];
const createdCashSessionIds: string[] = [];

let adminUserId = "";
let barberId = "";
let serviceId = "";
let rewardRuleId = "";
let cancelSimpleVisitId = "";
let cancelRewardVisitId = "";
let cancelCampaignVisitId = "";
let paymentVisitId = "";
let amountSimpleVisitId = "";
let amountRewardVisitId = "";
let amountPercentageCampaignVisitId = "";
let amountFixedCampaignVisitId = "";
let reportFrom: Date;
let reportTo: Date;

describe("admin visit corrections", () => {
  beforeAll(async () => {
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } })).id;
    const barber = await prisma.barber.create({
      data: {
        name: `حلاق تصحيحات ${Date.now()}`,
        phone: `9665${Date.now().toString().slice(-8)}`,
        accessPinHash: await hashBarberPin("Tanal@123"),
        isActive: true,
      },
    });
    barberId = barber.id;
    createdBarberIds.push(barberId);
    createdCashSessionIds.push((await openCashSession(prisma, { barberId })).cashSession.id);
    const service = await prisma.service.create({
      data: { name: `خدمة تصحيحات ${Date.now()}`, defaultPrice: 50, isActive: true, sortOrder: 120 },
    });
    serviceId = service.id;
    createdServiceIds.push(serviceId);
    rewardRuleId = (await prisma.rewardRule.findFirstOrThrow({ where: { requiredPoints: 500, isActive: true } })).id;
    reportFrom = normalizeCloseDate(new Date());
    reportTo = new Date(reportFrom);
    reportTo.setDate(reportTo.getDate() + 1);

    cancelSimpleVisitId = (await createVisit({ name: "إلغاء بسيط", grossAmount: 100, paymentMethod: "CASH" })).id;
    cancelRewardVisitId = (await createVisit({ name: "إلغاء مكافأة", grossAmount: 70, paymentMethod: "NETWORK", reward: true })).id;
    cancelCampaignVisitId = (await createVisit({ name: "إلغاء حملة", grossAmount: 80, paymentMethod: "CASH", fixedCampaign: 20 })).id;
    paymentVisitId = (await createVisit({ name: "تعديل دفع", grossAmount: 90, paymentMethod: "CASH" })).id;
    amountSimpleVisitId = (await createVisit({ name: "تعديل مبلغ بسيط", grossAmount: 100, paymentMethod: "CASH" })).id;
    amountRewardVisitId = (await createVisit({ name: "تعديل مبلغ مكافأة", grossAmount: 70, paymentMethod: "NETWORK", reward: true })).id;
    amountPercentageCampaignVisitId = (await createVisit({ name: "تعديل حملة نسبة", grossAmount: 100, paymentMethod: "CASH", percentageCampaign: 10 })).id;
    amountFixedCampaignVisitId = (await createVisit({ name: "تعديل حملة ثابتة", grossAmount: 70, paymentMethod: "CASH", fixedCampaign: 20 })).id;

    const close = await closeCashSession(prisma, {
      barberId,
      closedByUserId: adminUserId,
    });
    createdCloseIds.push(close.id);
  }, 30000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...createdVisitIds, ...createdCloseIds, ...createdCampaignIds, ...createdCustomerIds, ...createdServiceIds, ...createdBarberIds] } }, { actorBarberId: { in: createdBarberIds } }] } });
    await prisma.cashSession.deleteMany({ where: { id: { in: [...createdCashSessionIds, ...createdCloseIds] } } });
    await prisma.campaignRedemption.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.loyaltyTransaction.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
    await prisma.$disconnect();
  });

  it("requires reasons and dashboard access for corrections", () => {
    expect(visitCancelSchema.safeParse({ reason: "bad" }).success).toBe(false);
    expect(visitPaymentMethodUpdateSchema.safeParse({ paymentMethod: "NETWORK", reason: "bad" }).success).toBe(false);
    expect(visitAmountUpdateSchema.safeParse({ grossAmount: 100, reason: "bad" }).success).toBe(false);
    expect(canAccessDashboard(null)).toBe(false);
    expect(canAccessDashboard({ type: "barber", id: "s", role: "BARBER", organizationId: "org_default", salonId: "salon_default", barber: { id: barberId, name: "حلاق", phone: "966500000000", role: "BARBER" } })).toBe(false);
    expect(canAccessDashboard({ type: "dashboard", id: "s2", role: "ADMIN", organizationId: "org_default", salonId: null, user: { id: adminUserId, name: "مدير", email: "admin@tanal.local", role: "ADMIN" } })).toBe(true);
  });

  it("cancels a normal visit, reverses earned points, keeps services, and excludes it from reports", async () => {
    const before = await getRevenueReport(prisma, { from: reportFrom, to: reportTo, barberId });
    const result = await cancelVisit(prisma, cancelSimpleVisitId, adminMeta("إلغاء اختبار بسيط"));
    const visit = await prisma.visit.findUniqueOrThrow({ where: { id: cancelSimpleVisitId }, include: { services: true, loyaltyTransactions: true } });
    const after = await getRevenueReport(prisma, { from: reportFrom, to: reportTo, barberId });

    expect(result.visit.status).toBe("CANCELLED");
    expect(visit.services.length).toBeGreaterThan(0);
    expect(visit.loyaltyTransactions.some((transaction) => transaction.type === "REVERSAL" && transaction.points === -100)).toBe(true);
    expect(after.visitsCount).toBe(before.visitsCount - 1);
    expect(after.netAmount).toBe(before.netAmount - 100);
  });

  it("cancels a reward visit and restores redeemed points", async () => {
    const beforeTransactions = await prisma.loyaltyTransaction.findMany({ where: { visitId: cancelRewardVisitId } });
    const result = await cancelVisit(prisma, cancelRewardVisitId, adminMeta("إلغاء مكافأة اختبار"));
    const transactions = await prisma.loyaltyTransaction.findMany({ where: { visitId: cancelRewardVisitId } });

    expect(result.visit.status).toBe("CANCELLED");
    expect(beforeTransactions.some((transaction) => transaction.type === "REDEEM" && transaction.points === -500)).toBe(true);
    expect(transactions.some((transaction) => transaction.type === "REVERSAL" && transaction.points === 500)).toBe(true);
  });

  it("cancels a campaign visit without deleting campaign redemption", async () => {
    await cancelVisit(prisma, cancelCampaignVisitId, adminMeta("إلغاء حملة اختبار"));
    const redemption = await prisma.campaignRedemption.findUnique({ where: { visitId: cancelCampaignVisitId } });
    const report = await getRevenueReport(prisma, { from: reportFrom, to: reportTo, barberId });

    expect(redemption).toBeTruthy();
    expect(report.campaignRedemptionsCount).toBeGreaterThanOrEqual(2);
    expect((await prisma.visit.findUniqueOrThrow({ where: { id: cancelCampaignVisitId } })).status).toBe("CANCELLED");
  });

  it("updates payment method without changing net amount and moves report totals", async () => {
    const before = await getRevenueReport(prisma, { from: reportFrom, to: reportTo, barberId });
    const result = await updateVisitPaymentMethod(prisma, paymentVisitId, "NETWORK", adminMeta("تصحيح طريقة الدفع"));
    const after = await getRevenueReport(prisma, { from: reportFrom, to: reportTo, barberId });

    expect(result.visit.netAmount).toBe(90);
    expect(after.cashAmount).toBe(before.cashAmount - 90);
    expect(after.networkAmount).toBe(before.networkAmount + 90);
  });

  it("updates a no-discount amount and adjusts earned points", async () => {
    const result = await updateVisitAmount(prisma, amountSimpleVisitId, 120, adminMeta("تصحيح مبلغ بسيط"));
    const adjustment = await prisma.loyaltyTransaction.findFirst({ where: { visitId: amountSimpleVisitId, type: "ADJUST" }, orderBy: { createdAt: "desc" } });

    expect(result.visit.grossAmount).toBe(120);
    expect(result.visit.netAmount).toBe(120);
    expect(result.pointsAdjustment).toBe(20);
    expect(adjustment?.points).toBe(20);
  });

  it("updates a reward amount while preserving redeemed points", async () => {
    const result = await updateVisitAmount(prisma, amountRewardVisitId, 80, adminMeta("تصحيح مبلغ مكافأة"));
    const transactions = await prisma.loyaltyTransaction.findMany({ where: { visitId: amountRewardVisitId } });

    expect(result.visit.discountAmount).toBe(25);
    expect(result.visit.netAmount).toBe(55);
    expect(result.pointsAdjustment).toBe(10);
    expect(transactions.filter((transaction) => transaction.type === "REDEEM" && transaction.points === -500)).toHaveLength(1);
  });

  it("updates a percentage campaign amount and recalculates discount and points", async () => {
    const result = await updateVisitAmount(prisma, amountPercentageCampaignVisitId, 80, adminMeta("تصحيح حملة نسبة"));
    const adjustment = await prisma.loyaltyTransaction.findFirst({ where: { visitId: amountPercentageCampaignVisitId, type: "ADJUST" }, orderBy: { createdAt: "desc" } });

    expect(result.visit.discountAmount).toBe(8);
    expect(result.visit.netAmount).toBe(72);
    expect(result.pointsAdjustment).toBe(-18);
    expect(adjustment?.points).toBe(-18);
  });

  it("rejects a fixed campaign amount when discount exceeds the new gross amount", async () => {
    await expect(updateVisitAmount(prisma, amountFixedCampaignVisitId, 10, adminMeta("تصحيح مرفوض"))).rejects.toThrow("قيمة خصم الحملة أكبر");
  });

  it("records audit logs and post-close adjustment for corrections", async () => {
    const paymentAudit = await prisma.auditLog.count({ where: { action: "visit.payment_method_updated", entityId: paymentVisitId } });
    const amountAudit = await prisma.auditLog.count({ where: { action: "visit.amount_updated", entityId: amountSimpleVisitId } });
    const cancelAudit = await prisma.auditLog.count({ where: { action: "visit.cancelled", entityId: cancelSimpleVisitId } });
    const postCloseAudit = await prisma.auditLog.count({ where: { action: "visit.post_close_adjustment", entityId: { in: [paymentVisitId, amountSimpleVisitId, cancelSimpleVisitId] } } });

    expect(paymentAudit).toBeGreaterThan(0);
    expect(amountAudit).toBeGreaterThan(0);
    expect(cancelAudit).toBeGreaterThan(0);
    expect(postCloseAudit).toBeGreaterThan(0);
  });

  it("safe responses do not expose sensitive fields", async () => {
    const result = await updateVisitPaymentMethod(prisma, amountFixedCampaignVisitId, "NETWORK", adminMeta("تصحيح آمن"));
    const json = JSON.stringify(result);

    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("accessPinHash");
  });
});

async function createVisit({
  name,
  grossAmount,
  paymentMethod,
  reward,
  fixedCampaign,
  percentageCampaign,
}: {
  name: string;
  grossAmount: number;
  paymentMethod: "CASH" | "NETWORK";
  reward?: boolean;
  fixedCampaign?: number;
  percentageCampaign?: number;
}) {
  const customer = await createCustomer(name);
  if (reward) {
    await prisma.loyaltyAccount.update({
      where: { customerId: customer.customer.id },
      data: { points: 520, lifetimeEarned: 520 },
    });
  }
  const campaignId = fixedCampaign || percentageCampaign
    ? await createCampaign(fixedCampaign ? "FIXED_AMOUNT" : "PERCENTAGE", fixedCampaign ?? percentageCampaign ?? 0)
    : undefined;
  const result = await confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
    customerId: customer.customer.id,
    barberId,
    serviceIds: [serviceId],
    grossAmount,
    paymentMethod,
    rewardRuleId: reward ? rewardRuleId : undefined,
    campaignId,
    idempotencyKey: `admin-visit-${Date.now()}-${Math.random()}`,
  });
  createdVisitIds.push(result.visit.id);
  return result.visit;
}

async function createCustomer(name: string) {
  const result = await createCustomerWithLoyalty({
    prisma,
    organizationId: "org_default",
    name,
    phone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
    createdByBarberId: barberId,
  });
  createdCustomerIds.push(result.customer.id);
  return result;
}

async function createCampaign(discountType: "FIXED_AMOUNT" | "PERCENTAGE", discountValue: number) {
  const campaign = await prisma.campaign.create({
    data: {
      name: `حملة تصحيح ${discountType} ${Date.now()} ${Math.random()}`,
      discountType,
      discountValue,
      targetType: "ALL_CUSTOMERS",
      startAt: new Date(Date.now() - 60 * 1000),
      endAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      maxUsesPerCustomer: 1,
    },
  });
  createdCampaignIds.push(campaign.id);
  return campaign.id;
}

function adminMeta(reason: string) {
  return {
    actorUserId: adminUserId,
    actorType: "ADMIN" as const,
    reason,
  };
}
