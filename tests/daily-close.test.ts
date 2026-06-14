import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { canAccessDashboard } from "../lib/auth/access";
import { openCashSession } from "../lib/cash-sessions/cash-session-service";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import {
  closeBarberDay,
  getDailyCloseHistory,
  getDailyCloseSummary,
  normalizeCloseDate,
} from "../lib/daily-close/daily-close-service";
import { getOperationAlerts } from "../lib/daily-close/operation-alerts";
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
let openBarberId = "";
let highDiscountBarberId = "";
let serviceId = "";
let rewardCustomerId = "";
let closedCustomerId = "";
let rewardRuleId = "";
let campaignId = "";
let closeDate: Date;

describe("daily close and operation alerts", () => {
  beforeAll(async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } });
    adminUserId = admin.id;
    const barber = await prisma.barber.create({
      data: {
        name: `حلاق إغلاق ${Date.now()}`,
        phone: randomSaudiPhone(),
        accessPinHash: await hashBarberPin("1234"),
        isActive: true,
      },
    });
    barberId = barber.id;
    createdBarberIds.push(barberId);
    createdCashSessionIds.push((await openCashSession(prisma, { barberId })).cashSession.id);
    const openBarber = await prisma.barber.create({
      data: {
        name: `حلاق مفتوح ${Date.now()}`,
        phone: randomSaudiPhone(),
        accessPinHash: await hashBarberPin("1234"),
        isActive: true,
      },
    });
    openBarberId = openBarber.id;
    createdBarberIds.push(openBarberId);
    createdCashSessionIds.push((await openCashSession(prisma, { barberId: openBarberId })).cashSession.id);
    const highDiscountBarber = await prisma.barber.create({
      data: {
        name: `حلاق خصم مرتفع ${Date.now()}`,
        phone: randomSaudiPhone(),
        accessPinHash: await hashBarberPin("1234"),
        isActive: true,
      },
    });
    highDiscountBarberId = highDiscountBarber.id;
    createdBarberIds.push(highDiscountBarberId);
    createdCashSessionIds.push((await openCashSession(prisma, { barberId: highDiscountBarberId })).cashSession.id);
    closeDate = normalizeCloseDate(new Date());

    const service = await prisma.service.create({
      data: { name: `خدمة إغلاق ${Date.now()}`, defaultPrice: 60, isActive: true, sortOrder: 90 },
    });
    serviceId = service.id;
    createdServiceIds.push(serviceId);

    const cashCustomer = await createCustomer("عميل كاش إغلاق");
    const cardCustomer = await createCustomer("عميل شبكة إغلاق");
    const campaignCustomer = await createCustomer("عميل حملة إغلاق");
    const rewardCustomer = await createCustomer("عميل مكافأة إغلاق");
    rewardCustomerId = rewardCustomer.customer.id;
    const closedCustomer = await createCustomer("عميل بعد الإغلاق");
    closedCustomerId = closedCustomer.customer.id;
    const openCashCustomer = await createCustomer("عميل كاش مفتوح");
    const highDiscountCustomer = await createCustomer("عميل خصم مرتفع");

    await prisma.loyaltyAccount.update({
      where: { customerId: rewardCustomerId },
      data: { points: 520, lifetimeEarned: 520 },
    });
    rewardRuleId = (await prisma.rewardRule.findFirstOrThrow({ where: { requiredPoints: 500, isActive: true } })).id;
    const campaign = await prisma.campaign.create({
      data: {
        name: `حملة إغلاق ${Date.now()}`,
        discountType: "FIXED_AMOUNT",
        discountValue: 20,
        targetType: "ALL_CUSTOMERS",
        startAt: new Date(Date.now() - 60 * 1000),
        endAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        maxUsesPerCustomer: 1,
      },
    });
    campaignId = campaign.id;
    createdCampaignIds.push(campaignId);

    const cashVisit = await confirmVisit(prisma, {
      customerId: cashCustomer.customer.id,
      barberId,
      serviceIds: [serviceId],
      grossAmount: 100,
      paymentMethod: "CASH",
      idempotencyKey: `daily-cash-${Date.now()}`,
    });
    const cardVisit = await confirmVisit(prisma, {
      customerId: cardCustomer.customer.id,
      barberId,
      serviceIds: [serviceId],
      grossAmount: 80,
      paymentMethod: "NETWORK",
      idempotencyKey: `daily-card-${Date.now()}`,
    });
    const campaignVisit = await confirmVisit(prisma, {
      customerId: campaignCustomer.customer.id,
      barberId,
      serviceIds: [serviceId],
      grossAmount: 70,
      paymentMethod: "CASH",
      campaignId,
      idempotencyKey: `daily-campaign-${Date.now()}`,
    });
    const rewardVisit = await confirmVisit(prisma, {
      customerId: rewardCustomerId,
      barberId,
      serviceIds: [serviceId],
      grossAmount: 70,
      paymentMethod: "NETWORK",
      rewardRuleId,
      idempotencyKey: `daily-reward-${Date.now()}`,
    });
    const openCashVisit = await confirmVisit(prisma, {
      customerId: openCashCustomer.customer.id,
      barberId: openBarberId,
      serviceIds: [serviceId],
      grossAmount: 120,
      paymentMethod: "CASH",
      idempotencyKey: `daily-open-cash-${Date.now()}`,
    });
    const highDiscountVisit = await confirmVisit(prisma, {
      customerId: highDiscountCustomer.customer.id,
      barberId: highDiscountBarberId,
      serviceIds: [serviceId],
      grossAmount: 70,
      paymentMethod: "CASH",
      campaignId,
      idempotencyKey: `daily-high-discount-${Date.now()}`,
    });
    createdVisitIds.push(cashVisit.visit.id, cardVisit.visit.id, campaignVisit.visit.id, rewardVisit.visit.id, openCashVisit.visit.id, highDiscountVisit.visit.id);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...createdVisitIds, ...createdCloseIds, ...createdCampaignIds, ...createdCustomerIds, ...createdServiceIds, ...createdBarberIds] } }, { actorBarberId: { in: createdBarberIds } }] } });
    await prisma.dailyClose.deleteMany({ where: { OR: [{ id: { in: createdCloseIds } }, { barberId: { in: createdBarberIds } }] } });
    await prisma.campaignRedemption.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.loyaltyTransaction.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } });
    await prisma.cashSession.deleteMany({ where: { id: { in: createdCashSessionIds } } });
    await prisma.campaign.deleteMany({ where: { id: { in: createdCampaignIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
    await prisma.$disconnect();
  });

  it("summary calculates today's barber totals and starts as open", async () => {
    const summary = await getDailyCloseSummary(prisma, closeDate);
    const row = summary.find((item) => item.barberId === barberId);

    expect(row?.status).toBe("OPEN");
    expect(row?.visitsCount).toBe(4);
    expect(row?.cashTotal).toBe(150);
    expect(row?.cardTotal).toBe(125);
    expect(row?.discountTotal).toBe(45);
    expect(row?.netTotal).toBe(275);
    expect(row?.pointsEarnedTotal).toBe(275);
    expect(row?.pointsRedeemedTotal).toBe(500);
    expect(row?.rewardRedemptionsCount).toBe(1);
    expect(row?.campaignRedemptionsCount).toBe(1);
  });

  it("creates a daily close, defaults received cash, calculates difference, and marks summary closed", async () => {
    const close = await closeBarberDay(prisma, {
      barberId,
      date: closeDate,
      receivedByUserId: adminUserId,
      cashReceivedAmount: 140,
      notes: "اختبار فرق الكاش",
    });
    createdCloseIds.push(close.id);
    const summary = await getDailyCloseSummary(prisma, closeDate);
    const row = summary.find((item) => item.barberId === barberId);

    expect(close.cashTotal).toBe(150);
    expect(close.cashReceivedAmount).toBe(140);
    expect(close.cashDifference).toBe(-10);
    expect(row?.status).toBe("CLOSED");
    expect(row?.existingClose?.id).toBe(close.id);
  });

  it("prevents closing the same barber and date twice and writes audit logs", async () => {
    await expect(
      closeBarberDay(prisma, {
        barberId,
        date: closeDate,
        receivedByUserId: adminUserId,
      }),
    ).rejects.toThrow("تم إغلاق هذا اليوم مسبقًا");

    const createdAudit = await prisma.auditLog.count({ where: { action: "daily_close.created", entityId: { in: createdCloseIds } } });
    const duplicateAudit = await prisma.auditLog.count({ where: { action: "daily_close.duplicate_attempt" } });
    expect(createdAudit).toBeGreaterThan(0);
    expect(duplicateAudit).toBeGreaterThan(0);
  });

  it("history returns closes by date range", async () => {
    const history = await getDailyCloseHistory(prisma, { from: closeDate, to: closeDate, barberId });

    expect(history.some((close) => close.id === createdCloseIds[0])).toBe(true);
  });

  it("daily close remains a snapshot and does not block visits while a cash session is open", async () => {
    const visit = await confirmVisit(prisma, {
      customerId: closedCustomerId,
      barberId,
      serviceIds: [serviceId],
      grossAmount: 50,
      paymentMethod: "CASH",
      idempotencyKey: `daily-close-does-not-block-${Date.now()}`,
    });
    createdVisitIds.push(visit.visit.id);

    expect(visit.visit.cashSessionId).toBeTruthy();
  });

  it("operation alerts show unclosed cash and high discounts", async () => {
    const alerts = await getOperationAlerts(prisma, closeDate);

    expect(alerts.alerts.some((alert) => alert.type === "HIGH_DISCOUNT_RATIO" && "barberId" in alert && alert.barberId === highDiscountBarberId)).toBe(true);
    expect(alerts.alerts.some((alert) => alert.type === "UNCLOSED_CASH" && "barberId" in alert && alert.barberId === openBarberId)).toBe(true);
  });

  it("dashboard access rules block barber and anonymous users and allow admin", () => {
    expect(canAccessDashboard(null)).toBe(false);
    expect(
      canAccessDashboard({
        type: "barber",
        id: "daily-close-barber-session",
        role: "BARBER",
        barber: { id: barberId, name: "حلاق", phone: "966500000099", role: "BARBER" },
      }),
    ).toBe(false);
    expect(
      canAccessDashboard({
        type: "dashboard",
        id: "daily-close-admin-session",
        role: "ADMIN",
        user: { id: adminUserId, name: "مدير", email: "admin@tanal.local", role: "ADMIN" },
      }),
    ).toBe(true);
  });
});

async function createCustomer(name: string) {
  const result = await createCustomerWithLoyalty({
    prisma,
    name,
    phone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
    createdByBarberId: barberId,
  });
  createdCustomerIds.push(result.customer.id);
  return result;
}

function randomSaudiPhone() {
  return `9665${Math.floor(10000000 + Math.random() * 89999999)}`;
}
