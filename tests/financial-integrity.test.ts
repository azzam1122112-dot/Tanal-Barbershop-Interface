import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { canViewFinancials, canWithdrawBranchSafe } from "../lib/auth/access";
import { getBarberTodaySummary } from "../lib/barber/barber-summary";
import { openCashSession } from "../lib/cash-sessions/cash-session-service";
import { getCommissionReport } from "../lib/commissions/commission-report";
import { recordCashExpense } from "../lib/expenses/expense-service";
import { getFinancialPeriodReport } from "../lib/finance/financial-period";
import { updateVisitAmount } from "../lib/visits/visit-admin-service";
import { confirmVisit } from "../lib/visits/visit-service";

const ORG = "org_default";
const SALON = "salon_default";

function dashboardSession(role: "OWNER" | "ADMIN" | "SUPERVISOR") {
  return {
    type: "dashboard",
    role,
    organizationId: ORG,
    salonId: SALON,
    scopedSalonIds: role === "SUPERVISOR" ? [SALON] : null,
    user: { id: "user_test", name: "اختبار" },
  } as never;
}

describe("بوابات المال حسب الدور", () => {
  it("ربحية المؤسسة وسحب الخزنة لمالك/مدير فقط", () => {
    for (const gate of [canViewFinancials, canWithdrawBranchSafe]) {
      expect(gate(dashboardSession("OWNER"))).toBe(true);
      expect(gate(dashboardSession("ADMIN"))).toBe(true);
      // إخراج نقد من الخزنة وقراءة الربح: قرار ملكية لا تشغيل فرع.
      expect(gate(dashboardSession("SUPERVISOR"))).toBe(false);
      expect(gate(null)).toBe(false);
    }
  });
});

describe("سلامة الأرقام المالية", () => {
  const prisma = new PrismaClient();
  const visitIds: string[] = [];
  const expenseIds: string[] = [];
  const cashSessionIds: string[] = [];
  const productIds: string[] = [];
  let barberId = "";
  let adminUserId = "";
  let stamp = "";
  // `confirmVisit` يرفض مبلغًا لا يساوي مجموع أسعار الخدمات، فلكل حالة خدمتها.
  const serviceIds: Record<"large" | "medium" | "small", string> = { large: "", medium: "", small: "" };

  beforeAll(async () => {
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } })).id;
    stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const barber = await prisma.barber.create({
      data: {
        organizationId: ORG,
        salonId: SALON,
        name: `integrity-barber-${stamp}`,
        phone: `05${stamp.slice(-8)}`,
        accessPinHash: await hashBarberPin("Tanal@123"),
        isActive: true,
        commissionEnabled: true,
        commissionRate: 40,
      },
    });
    barberId = barber.id;

    for (const [key, price] of [["large", 300], ["medium", 100], ["small", 10]] as const) {
      const service = await prisma.service.create({
        data: {
          organizationId: ORG,
          salonId: SALON,
          name: `خدمة سلامة ${key} ${stamp}`,
          defaultPrice: price,
          isActive: true,
          sortOrder: 950,
        },
      });
      serviceIds[key] = service.id;
    }

    cashSessionIds.push((await openCashSession(prisma, { barberId, openingCashAmount: 0 })).cashSession.id);
  }, 60000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: visitIds } } });
    await prisma.cashCustodyMovement.deleteMany({ where: { barberId } });
    await prisma.cashExpense.deleteMany({ where: { OR: [{ id: { in: expenseIds } }, { barberId }] } });
    await prisma.loyaltyTransaction.deleteMany({ where: { visitId: { in: visitIds } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.visitProduct.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: visitIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.cashSession.deleteMany({ where: { id: { in: cashSessionIds } } });
    await prisma.barberCashBalance.deleteMany({ where: { barberId } });
    await prisma.service.deleteMany({ where: { id: { in: Object.values(serviceIds) } } });
    await prisma.barber.deleteMany({ where: { id: barberId } });
    await prisma.$disconnect();
  });

  it("تعديل مبلغ الزيارة يعيد توزيع العمولة بالنسبة المخزَّنة", async () => {
    const created = await confirmVisit(prisma, {
      organizationId: ORG,
      salonId: SALON,
      barberId,
      serviceIds: [serviceIds.large],
      grossAmount: 300,
      paymentMethod: "CASH",
      idempotencyKey: `integrity-amount-${stamp}`,
    });
    visitIds.push(created.visit.id);

    const before = await prisma.visit.findUniqueOrThrow({ where: { id: created.visit.id } });
    expect(Number(before.netAmount)).toBe(300);
    expect(Number(before.commissionAmount)).toBe(120);

    await updateVisitAmount(prisma, created.visit.id, 100, {
      actorUserId: adminUserId,
      actorType: "ADMIN",
      organizationId: ORG,
      reason: "تصحيح مبلغ محصَّل",
    });

    const after = await prisma.visit.findUniqueOrThrow({
      where: { id: created.visit.id },
      include: { services: true },
    });
    // الوعاء وحده تغيّر: 100 × 40% = 40. تركها 120 كان يستحق الحلاق عمولة على
    // مال لم يُحصَّل، ويُظهر «نسبة فعلية» 120% في تقرير المستحقات.
    expect(Number(after.netAmount)).toBe(100);
    expect(Number(after.commissionAmount)).toBe(40);
    // سطور الزيارة تتبع المجموع فلا ينفصل مجموع السطور عن مستحق الزيارة.
    expect(Number(after.services[0].commissionAmount)).toBe(40);
    expect(Number(after.services[0].commissionRate)).toBe(40);

    const report = await getCommissionReport(prisma, { organizationId: ORG, salonIds: [SALON], barberId });
    const row = report.rows.find((entry) => entry.barberId === barberId);
    expect(row?.effectiveRate).toBeLessThanOrEqual(100);
  }, 60000);

  it("رفع المبلغ يرفع المستحق بالنسبة نفسها لا بنسبة اليوم", async () => {
    const created = await confirmVisit(prisma, {
      organizationId: ORG,
      salonId: SALON,
      barberId,
      serviceIds: [serviceIds.medium],
      grossAmount: 100,
      paymentMethod: "NETWORK",
      idempotencyKey: `integrity-raise-${stamp}`,
    });
    visitIds.push(created.visit.id);

    // تغيير نسبة الحلاق بعد البيع يجب ألا يمسّ زيارة سابقة عند تعديل مبلغها.
    await prisma.barber.update({ where: { id: barberId }, data: { commissionRate: 90 } });
    await updateVisitAmount(prisma, created.visit.id, 200, {
      actorUserId: adminUserId,
      actorType: "ADMIN",
      organizationId: ORG,
      reason: "إضافة خدمة فاتها التسجيل",
    });
    await prisma.barber.update({ where: { id: barberId }, data: { commissionRate: 40 } });

    const after = await prisma.visit.findUniqueOrThrow({ where: { id: created.visit.id } });
    expect(Number(after.netAmount)).toBe(200);
    expect(Number(after.commissionAmount)).toBe(80);
  }, 60000);

  it("ملخص الحلاق اليومي يجمع كل زيارات اليوم لا أول ثمانٍ", async () => {
    for (let index = 0; index < 9; index += 1) {
      const visit = await confirmVisit(prisma, {
        organizationId: ORG,
        salonId: SALON,
        barberId,
        serviceIds: [serviceIds.small],
        grossAmount: 10,
        paymentMethod: "CASH",
        idempotencyKey: `integrity-many-${stamp}-${index}`,
      });
      visitIds.push(visit.visit.id);
    }

    const summary = await getBarberTodaySummary(prisma, barberId);
    // تسع زيارات بعشرة + زيارتا الاختبارين السابقين (100 كاش و200 شبكة).
    expect(summary.visitsCount).toBe(11);
    expect(summary.cashTotal).toBe(190);
    expect(summary.networkTotal).toBe(200);
    expect(summary.netTotal).toBe(390);
    // القائمة وحدها محدودة، والمجاميع كاملة.
    expect(summary.latestVisits).toHaveLength(5);
  }, 120000);

  it("يمنع الحلاق من تجاوز سقف مصروف الدرج ويسمح للمدير", async () => {
    await expect(
      recordCashExpense(prisma, {
        organizationId: ORG,
        salonId: SALON,
        barberId,
        amount: 5000,
        category: "SUPPLIES",
        note: "مبلغ يتجاوز السقف",
        recordedByBarberId: barberId,
      }),
    ).rejects.toThrow(/أقصى مصروف تسجّله بنفسك/);

    const managerExpense = await recordCashExpense(prisma, {
      organizationId: ORG,
      salonId: SALON,
      barberId,
      amount: 5000,
      category: "SUPPLIES",
      note: "نفس المبلغ باسم المدير",
      paymentSource: "EXTERNAL",
      recordedByUserId: adminUserId,
      recordedByActorType: "ADMIN",
    });
    expenseIds.push(managerExpense.id);
    expect(managerExpense.amount).toBe(5000);
  }, 60000);

  it("المتبقي للمؤسسة في البيان الشهري يعكس العمولة المصحَّحة", async () => {
    const report = await getFinancialPeriodReport(prisma, { organizationId: ORG, salonIds: [SALON] });
    const month = report.months[0];
    expect(month.contribution).toBe(
      Math.round((month.netSales - month.productCost - month.commissionAccrued - month.expensesTotal) * 100) / 100,
    );
  }, 30000);

  it("تكلفة المنتج تُجمَّد وقت البيع فلا يعيد تعديلها كتابة أرباح ماضية", async () => {
    const product = await prisma.product.create({
      data: {
        organizationId: ORG,
        salonId: SALON,
        name: `منتج تكلفة ${stamp}`,
        price: 50,
        costPrice: 20,
        stockQuantity: 10,
      },
    });
    productIds.push(product.id);

    const visit = await confirmVisit(prisma, {
      organizationId: ORG,
      salonId: SALON,
      barberId,
      serviceIds: [serviceIds.small],
      products: [{ productId: product.id, quantity: 2 }],
      grossAmount: 10,
      paymentMethod: "CASH",
      idempotencyKey: `integrity-cogs-${stamp}`,
    });
    visitIds.push(visit.visit.id);

    const before = await getFinancialPeriodReport(prisma, { organizationId: ORG, salonIds: [SALON] });
    expect(before.totals.productCost).toBe(40);
    expect(before.totals.productSales).toBe(100);

    // مضاعفة التكلفة في الكتالوج اليوم يجب ألا تمسّ ما بيع أمس.
    await prisma.product.update({ where: { id: product.id }, data: { costPrice: 45 } });
    const after = await getFinancialPeriodReport(prisma, { organizationId: ORG, salonIds: [SALON] });
    expect(after.totals.productCost).toBe(40);
    expect(after.totals.grossProfit).toBe(
      Math.round((after.totals.netSales - 40) * 100) / 100,
    );
  }, 60000);
});
