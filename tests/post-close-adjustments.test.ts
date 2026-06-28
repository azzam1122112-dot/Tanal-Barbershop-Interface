import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { canAccessDashboard } from "../lib/auth/access";
import { closeCashSession, openCashSession } from "../lib/cash-sessions/cash-session-service";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { normalizeCloseDate } from "../lib/daily-close/daily-close-service";
import { getPostCloseAdjustmentReport } from "../lib/post-close-adjustments/post-close-adjustment-report";
import { cancelVisit, updateVisitAmount, updateVisitPaymentMethod } from "../lib/visits/visit-admin-service";
import { confirmVisit } from "../lib/visits/visit-service";

const prisma = new PrismaClient();
const createdCustomerIds: string[] = [];
const createdServiceIds: string[] = [];
const createdVisitIds: string[] = [];
const createdBarberIds: string[] = [];
const createdCloseIds: string[] = [];
const createdCashSessionIds: string[] = [];

let adminUserId = "";
let barberId = "";
let openBarberId = "";
let serviceId = "";
let paymentVisitId = "";
let cashCancelVisitId = "";
let networkCancelVisitId = "";
let amountVisitId = "";
let openAdjustmentVisitId = "";
let reportFrom: Date;
let reportTo: Date;

describe("post-close adjustment report", () => {
  beforeAll(async () => {
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } })).id;
    const barber = await createBarber("حلاق تقرير تصحيحات");
    const openBarber = await createBarber("حلاق غير مغلق للتصحيحات");
    barberId = barber.id;
    openBarberId = openBarber.id;
    createdCashSessionIds.push((await openCashSession(prisma, { barberId })).cashSession.id);
    createdCashSessionIds.push((await openCashSession(prisma, { barberId: openBarberId })).cashSession.id);
    const service = await prisma.service.create({
      data: { name: `خدمة تقرير تصحيحات ${Date.now()}`, defaultPrice: 50, isActive: true, sortOrder: 150 },
    });
    serviceId = service.id;
    createdServiceIds.push(serviceId);
    reportFrom = normalizeCloseDate(new Date());
    reportTo = new Date(reportFrom);
    reportTo.setDate(reportTo.getDate() + 1);

    paymentVisitId = (await createVisit(barberId, "زيارة دفع بعد إغلاق", 70, "CASH")).id;
    cashCancelVisitId = (await createVisit(barberId, "زيارة كاش ملغاة بعد إغلاق", 45, "CASH")).id;
    networkCancelVisitId = (await createVisit(barberId, "زيارة شبكة ملغاة بعد إغلاق", 80, "NETWORK")).id;
    amountVisitId = (await createVisit(barberId, "زيارة مبلغ بعد إغلاق", 70, "NETWORK")).id;
    openAdjustmentVisitId = (await createVisit(openBarberId, "تصحيح قبل إغلاق", 60, "CASH")).id;

    const close = await closeCashSession(prisma, { barberId, closedByUserId: adminUserId });
    createdCloseIds.push(close.id);

    await updateVisitPaymentMethod(prisma, paymentVisitId, "NETWORK", adminMeta("تصحيح دفع بعد إغلاق"));
    await cancelVisit(prisma, cashCancelVisitId, adminMeta("إلغاء كاش بعد إغلاق"));
    await cancelVisit(prisma, networkCancelVisitId, adminMeta("إلغاء شبكة بعد إغلاق"));
    await updateVisitAmount(prisma, amountVisitId, 90, adminMeta("تصحيح مبلغ بعد إغلاق"));
    await updateVisitAmount(prisma, openAdjustmentVisitId, 80, adminMeta("تصحيح قبل الإغلاق لا يظهر"));
  }, 30000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...createdVisitIds, ...createdCloseIds, ...createdCustomerIds, ...createdServiceIds, ...createdBarberIds] } }, { actorBarberId: { in: createdBarberIds } }] } });
    await prisma.cashSession.deleteMany({ where: { id: { in: [...createdCashSessionIds, ...createdCloseIds] } } });
    await prisma.loyaltyTransaction.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
    await prisma.$disconnect();
  });

  it("returns only post-close adjustments and allows admin access rules", async () => {
    const report = await getPostCloseAdjustmentReport(prisma, { from: reportFrom, to: reportTo, barberId });

    expect(report.adjustments.map((adjustment) => adjustment.visitId)).toEqual(expect.arrayContaining([paymentVisitId, cashCancelVisitId, networkCancelVisitId, amountVisitId]));
    expect(report.adjustments.some((adjustment) => adjustment.visitId === openAdjustmentVisitId)).toBe(false);
    expect(report.adjustments.every((adjustment) => adjustment.postCloseAdjustment)).toBe(true);
    expect(canAccessDashboard(null)).toBe(false);
    expect(canAccessDashboard({ type: "barber", id: "b", role: "BARBER", organizationId: "org_default", salonId: "salon_default", barber: { id: barberId, name: "حلاق", phone: "966500000001", role: "BARBER" } })).toBe(false);
    expect(canAccessDashboard({ type: "dashboard", id: "a", role: "ADMIN", organizationId: "org_default", salonId: null, scopedSalonIds: null, user: { id: adminUserId, name: "مدير", email: "admin@tanal.local", role: "ADMIN" } })).toBe(true);
  });

  it("calculates payment method financial impact from cash to network", async () => {
    const report = await getPostCloseAdjustmentReport(prisma, { from: reportFrom, to: reportTo, barberId, adjustmentType: "VISIT_PAYMENT_METHOD_UPDATED" });
    const row = report.adjustments.find((adjustment) => adjustment.visitId === paymentVisitId);

    expect(row?.financialImpact).toMatchObject({ grossDelta: 0, discountDelta: 0, netDelta: 0, cashDelta: -70, cardDelta: 70 });
    expect(row?.pointsImpact.finalBalanceChange).toBe(0);
  });

  it("calculates cash and network cancellation impacts", async () => {
    const report = await getPostCloseAdjustmentReport(prisma, { from: reportFrom, to: reportTo, barberId, adjustmentType: "VISIT_CANCELLED" });
    const cash = report.adjustments.find((adjustment) => adjustment.visitId === cashCancelVisitId);
    const network = report.adjustments.find((adjustment) => adjustment.visitId === networkCancelVisitId);

    expect(cash?.financialImpact).toMatchObject({ grossDelta: -45, discountDelta: 0, netDelta: -45, cashDelta: -45, cardDelta: 0 });
    expect(cash?.pointsImpact).toMatchObject({ earnedPointsDelta: -45, redeemedPointsDelta: 0, finalBalanceChange: -45 });
    expect(network?.financialImpact).toMatchObject({ grossDelta: -80, discountDelta: 0, netDelta: -80, cashDelta: 0, cardDelta: -80 });
    expect(network?.pointsImpact.finalBalanceChange).toBe(-80);
  });

  it("calculates amount update impact and summaries", async () => {
    const report = await getPostCloseAdjustmentReport(prisma, { from: reportFrom, to: reportTo, barberId });
    const amount = report.adjustments.find((adjustment) => adjustment.visitId === amountVisitId);

    expect(amount?.financialImpact).toMatchObject({ grossDelta: 20, discountDelta: 0, netDelta: 20, cashDelta: 0, cardDelta: 20 });
    expect(amount?.pointsImpact).toMatchObject({ earnedPointsDelta: 20, redeemedPointsDelta: 0, finalBalanceChange: 20 });
    expect(report.summary.count).toBe(4);
    expect(report.summary.cashDelta).toBe(-115);
    expect(report.summary.cardDelta).toBe(10);
    expect(report.summary.netDelta).toBe(-105);
    expect(report.summary.pointsDelta).toBe(-105);
  });

  it("supports barber and date filters and does not expose sensitive fields", async () => {
    const filtered = await getPostCloseAdjustmentReport(prisma, { from: reportFrom, to: reportTo, barberId });
    const outside = await getPostCloseAdjustmentReport(prisma, {
      from: new Date(reportTo.getTime() + 24 * 60 * 60 * 1000),
      to: new Date(reportTo.getTime() + 48 * 60 * 60 * 1000),
      barberId,
    });
    const json = JSON.stringify(filtered);

    expect(filtered.adjustments).toHaveLength(4);
    expect(outside.adjustments).toHaveLength(0);
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("accessPinHash");
  });
});

async function createBarber(name: string) {
  const barber = await prisma.barber.create({
    data: {
      name: `${name} ${Date.now()} ${Math.random()}`,
      phone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
      accessPinHash: await hashBarberPin("Tanal@123"),
      isActive: true,
    },
  });
  createdBarberIds.push(barber.id);
  return barber;
}

async function createVisit(targetBarberId: string, name: string, grossAmount: number, paymentMethod: "CASH" | "NETWORK") {
  const customer = await createCustomer(name, targetBarberId);
  const result = await confirmVisit(prisma, {
      organizationId: "org_default",
      salonId: "salon_default",
    customerId: customer.customer.id,
    barberId: targetBarberId,
    serviceIds: [serviceId],
    grossAmount,
    paymentMethod,
    idempotencyKey: `post-close-${Date.now()}-${Math.random()}`,
  });
  createdVisitIds.push(result.visit.id);
  return result.visit;
}

async function createCustomer(name: string, targetBarberId: string) {
  const result = await createCustomerWithLoyalty({
    prisma,
    organizationId: "org_default",
    name,
    phone: `9665${Math.floor(10000000 + Math.random() * 89999999)}`,
    createdByBarberId: targetBarberId,
  });
  createdCustomerIds.push(result.customer.id);
  return result;
}

function adminMeta(reason: string) {
  return {
    actorUserId: adminUserId,
    actorType: "ADMIN" as const,
    reason,
  };
}
