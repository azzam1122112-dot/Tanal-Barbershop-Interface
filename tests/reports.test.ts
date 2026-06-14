import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { canAccessDashboard } from "../lib/auth/access";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { confirmVisit } from "../lib/visits/visit-service";
import { openCashSession } from "../lib/cash-sessions/cash-session-service";
import {
  getBarberPerformanceReport,
  getCustomerReport,
  getDashboardSummary,
  getDiscountReport,
  getRevenueReport,
  getServiceReport,
} from "../lib/reports/dashboard-reports";

const prisma = new PrismaClient();
const createdCustomerIds: string[] = [];
const createdServiceIds: string[] = [];
const createdVisitIds: string[] = [];
const createdCampaignIds: string[] = [];
const createdBarberIds: string[] = [];
const createdCashSessionIds: string[] = [];
const reportDate = new Date("2030-01-10T10:00:00.000Z");
const reportFrom = new Date("2030-01-10T00:00:00.000Z");
const reportTo = new Date("2030-01-11T00:00:00.000Z");

let barberId = "";
let secondBarberId = "";
let serviceId = "";
let secondServiceId = "";
let rewardRuleId = "";
let campaignId = "";
let topCustomerId = "";

describe("dashboard reports", () => {
  beforeAll(async () => {
    const barber = await prisma.barber.create({
      data: {
        name: `حلاق تقارير أساسي ${Date.now()}`,
        phone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
        accessPinHash: await hashBarberPin("1234"),
        isActive: true,
      },
    });
    barberId = barber.id;
    createdBarberIds.push(barberId);
    createdCashSessionIds.push((await openCashSession(prisma, { barberId })).cashSession.id);
    const secondBarber = await prisma.barber.create({
      data: {
        name: `حلاق تقارير ${Date.now()}`,
        phone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
        accessPinHash: await hashBarberPin("1234"),
        isActive: true,
      },
    });
    secondBarberId = secondBarber.id;
    createdBarberIds.push(secondBarberId);
    createdCashSessionIds.push((await openCashSession(prisma, { barberId: secondBarberId })).cashSession.id);

    const service = await prisma.service.create({
      data: { name: `خدمة تقارير ${Date.now()}`, defaultPrice: 50, isActive: true, sortOrder: 20 },
    });
    const secondService = await prisma.service.create({
      data: { name: `خدمة تقارير ثانية ${Date.now()}`, defaultPrice: 30, isActive: true, sortOrder: 21 },
    });
    serviceId = service.id;
    secondServiceId = secondService.id;
    createdServiceIds.push(serviceId, secondServiceId);

    const rewardRule = await prisma.rewardRule.findFirstOrThrow({ where: { requiredPoints: 500, isActive: true } });
    rewardRuleId = rewardRule.id;
    const campaign = await prisma.campaign.create({
      data: {
        name: `حملة تقارير ${Date.now()}`,
        discountType: "FIXED_AMOUNT",
        discountValue: 20,
        targetType: "ALL_CUSTOMERS",
        startAt: new Date(Date.now() - 60 * 1000),
        endAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        maxUsesPerCustomer: 1,
        isActive: true,
      },
    });
    campaignId = campaign.id;
    createdCampaignIds.push(campaignId);

    const cashCustomer = await createCustomer("عميل كاش");
    topCustomerId = cashCustomer.customer.id;
    const rewardCustomer = await createCustomer("عميل مكافأة");
    const campaignCustomer = await createCustomer("عميل حملة");
    await prisma.loyaltyAccount.update({
      where: { customerId: rewardCustomer.customer.id },
      data: { points: 520, lifetimeEarned: 520 },
    });

    const cashVisit = await confirmVisit(prisma, {
      customerId: cashCustomer.customer.id,
      barberId,
      serviceIds: [serviceId],
      grossAmount: 100,
      paymentMethod: "CASH",
      idempotencyKey: `report-cash-${Date.now()}`,
    });
    const rewardVisit = await confirmVisit(prisma, {
      customerId: rewardCustomer.customer.id,
      barberId,
      serviceIds: [serviceId],
      grossAmount: 70,
      paymentMethod: "NETWORK",
      rewardRuleId,
      idempotencyKey: `report-reward-${Date.now()}`,
    });
    const campaignVisit = await confirmVisit(prisma, {
      customerId: campaignCustomer.customer.id,
      barberId: secondBarberId,
      serviceIds: [secondServiceId],
      grossAmount: 80,
      paymentMethod: "CASH",
      campaignId,
      idempotencyKey: `report-campaign-${Date.now()}`,
    });
    createdVisitIds.push(cashVisit.visit.id, rewardVisit.visit.id, campaignVisit.visit.id);

    await prisma.visit.updateMany({
      where: { id: { in: createdVisitIds } },
      data: { visitedAt: reportDate },
    });
    await prisma.customer.updateMany({
      where: { id: { in: createdCustomerIds } },
      data: { lastVisitAt: reportDate },
    });

    const inactiveCustomer = await createCustomer("عميل منقطع للتقارير");
    await prisma.customer.update({
      where: { id: inactiveCustomer.customer.id },
      data: {
        visitCount: 1,
        lastVisitAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...createdVisitIds, ...createdCampaignIds, ...createdCustomerIds, ...createdServiceIds, ...createdBarberIds] } } });
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

  it("calculates revenue totals, cash, network, discounts, net, average, and loyalty points", async () => {
    const report = await getRevenueReport(prisma, { from: reportFrom, to: reportTo });

    expect(report.grossAmount).toBe(250);
    expect(report.discountAmount).toBe(45);
    expect(report.netAmount).toBe(205);
    expect(report.cashAmount).toBe(160);
    expect(report.networkAmount).toBe(45);
    expect(report.visitsCount).toBe(3);
    expect(report.averageTicket).toBe(68.33);
    expect(report.pointsEarned).toBe(205);
    expect(report.pointsRedeemed).toBe(500);
    expect(report.rewardRedemptionsCount).toBe(1);
    expect(report.campaignRedemptionsCount).toBe(1);
  });

  it("filters revenue by barber and payment method", async () => {
    const barberReport = await getRevenueReport(prisma, { from: reportFrom, to: reportTo, barberId });
    const cashReport = await getRevenueReport(prisma, { from: reportFrom, to: reportTo, paymentMethod: "CASH" });
    const networkReport = await getRevenueReport(prisma, { from: reportFrom, to: reportTo, paymentMethod: "NETWORK" });

    expect(barberReport.visitsCount).toBe(2);
    expect(barberReport.netAmount).toBe(145);
    expect(cashReport.visitsCount).toBe(2);
    expect(cashReport.netAmount).toBe(160);
    expect(networkReport.visitsCount).toBe(1);
    expect(networkReport.netAmount).toBe(45);
  });

  it("calculates barber performance", async () => {
    const performance = await getBarberPerformanceReport(prisma, { from: reportFrom, to: reportTo });
    const primary = performance.find((row) => row.barber.id === barberId);
    const secondary = performance.find((row) => row.barber.id === secondBarberId);

    expect(primary?.visitsCount).toBe(2);
    expect(primary?.netAmount).toBe(145);
    expect(primary?.cashAmount).toBe(100);
    expect(primary?.networkAmount).toBe(45);
    expect(primary?.discountAmount).toBe(25);
    expect(primary?.rewardRedemptionsCount).toBe(1);
    expect(secondary?.visitsCount).toBe(1);
    expect(secondary?.campaignRedemptionsCount).toBe(1);
  });

  it("reports the most used services", async () => {
    const services = await getServiceReport(prisma, { from: reportFrom, to: reportTo });

    expect(services[0]).toMatchObject({ serviceId, usageCount: 2, visitsCount: 2, linkedSales: 100 });
    expect(services.some((service) => service.serviceId === secondServiceId && service.usageCount === 1)).toBe(true);
  });

  it("reports top customers and inactive customers", async () => {
    const customers = await getCustomerReport(prisma, { from: reportFrom, to: reportTo });

    expect(customers.topCustomers[0]).toMatchObject({
      customer: { id: topCustomerId },
      visitsCount: 1,
      netAmount: 100,
    });
    expect(customers.inactiveCustomers.some((row) => row.daysSinceLastVisit !== null && row.daysSinceLastVisit >= 30)).toBe(true);
  });

  it("reports discount usage and top campaign", async () => {
    const discounts = await getDiscountReport(prisma, { from: reportFrom, to: reportTo });

    expect(discounts.rewardDiscountAmount).toBe(25);
    expect(discounts.campaignDiscountAmount).toBe(20);
    expect(discounts.rewardRedemptionsCount).toBe(1);
    expect(discounts.campaignRedemptionsCount).toBe(1);
    expect(discounts.topCampaign?.campaignId).toBe(campaignId);
  });

  it("dashboard summary uses confirmed visits only and does not expose sensitive fields", async () => {
    const cancelled = await prisma.visit.create({
      data: {
        customerId: topCustomerId,
        barberId,
        grossAmount: 999,
        discountAmount: 0,
        netAmount: 999,
        paymentMethod: "CASH",
        status: "CANCELLED",
        visitedAt: reportDate,
      },
    });
    createdVisitIds.push(cancelled.id);

    const summary = await getDashboardSummary(prisma, reportDate);
    expect(summary.netAmount).toBe(205);
    expect(JSON.stringify(summary)).not.toContain("passwordHash");
    expect(JSON.stringify(summary)).not.toContain("accessPinHash");
  });

  it("reports legacy completed visits without cashSessionId", async () => {
    const legacyDate = new Date("2030-02-01T10:00:00.000Z");
    const legacyFrom = new Date("2030-02-01T00:00:00.000Z");
    const legacyTo = new Date("2030-02-02T00:00:00.000Z");
    const legacyVisit = await prisma.visit.create({
      data: {
        customerId: topCustomerId,
        barberId,
        grossAmount: 40,
        discountAmount: 0,
        netAmount: 40,
        paymentMethod: "NETWORK",
        status: "COMPLETED",
        visitedAt: legacyDate,
      },
    });
    createdVisitIds.push(legacyVisit.id);

    const report = await getRevenueReport(prisma, { from: legacyFrom, to: legacyTo });

    expect(legacyVisit.cashSessionId).toBeNull();
    expect(report.visitsCount).toBe(1);
    expect(report.netAmount).toBe(40);
    expect(report.cashAmount + report.networkAmount).toBe(report.netAmount);
  });

  it("dashboard access rules block barber and anonymous users and allow admin", () => {
    expect(canAccessDashboard(null)).toBe(false);
    expect(
      canAccessDashboard({
        type: "barber",
        id: "report-session-barber",
        role: "BARBER",
        barber: { id: barberId, name: "حلاق", phone: "966500000002", role: "BARBER" },
      }),
    ).toBe(false);
    expect(
      canAccessDashboard({
        type: "dashboard",
        id: "report-session-admin",
        role: "ADMIN",
        user: { id: "admin", name: "مدير", email: "admin@tanal.local", role: "ADMIN" },
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
