import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import {
  addRiyadhMonths,
  getRiyadhMonthSpan,
  isRiyadhMonthKey,
  parseRiyadhMonthKey,
  riyadhMonthKeysBetween,
  toRiyadhMonthKey,
} from "../lib/datetime/riyadh";
import { contributionMargin, organizationContribution } from "../lib/finance/contribution";
import { getFinancialPeriodReport, MAX_FINANCIAL_MONTHS, resolveMonthSpan } from "../lib/finance/financial-period";
import { getCommissionMovement } from "../lib/finance/commission-movement";

const ORG = "org_default";

describe("مفتاح الشهر التشغيلي", () => {
  it("ينسب اللحظة إلى شهر الرياض لا شهر UTC", () => {
    // 21:30 بتوقيت UTC في 31 أغسطس = 00:30 من 1 سبتمبر في الرياض.
    const instant = new Date("2026-08-31T21:30:00.000Z");
    expect(toRiyadhMonthKey(instant)).toBe("2026-09");
    // ودقيقة قبلها ما زالت أغسطس.
    expect(toRiyadhMonthKey(new Date("2026-08-31T20:59:00.000Z"))).toBe("2026-08");
  });

  it("يبني بداية الشهر كلحظة UTC صحيحة", () => {
    expect(parseRiyadhMonthKey("2026-09").toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(addRiyadhMonths(parseRiyadhMonthKey("2026-01"), 1).toISOString()).toBe("2026-01-31T21:00:00.000Z");
  });

  it("يعبر حدّ السنة في العدّ والقوائم", () => {
    expect(toRiyadhMonthKey(addRiyadhMonths(parseRiyadhMonthKey("2026-12"), 1))).toBe("2027-01");
    expect(riyadhMonthKeysBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    const span = getRiyadhMonthSpan("2026-11", "2026-12");
    expect(span.from.toISOString()).toBe("2026-10-31T21:00:00.000Z");
    expect(span.to.toISOString()).toBe("2026-12-31T21:00:00.000Z");
  });

  it("يرفض المفاتيح غير الصالحة", () => {
    expect(isRiyadhMonthKey("2026-13")).toBe(false);
    expect(isRiyadhMonthKey("2026-1")).toBe(false);
    expect(isRiyadhMonthKey(null)).toBe(false);
    expect(isRiyadhMonthKey("2026-07")).toBe(true);
  });
});

describe("مدى الأشهر", () => {
  const now = new Date("2026-08-11T09:00:00.000Z");

  it("يفترض الشهر الجاري وحده بلا وسائط", () => {
    const span = resolveMonthSpan(null, null, now);
    expect(span.fromKey).toBe("2026-08");
    expect(span.toKey).toBe("2026-08");
    expect(span.monthKeys).toEqual(["2026-08"]);
  });

  it("يصحّح المدى المقلوب بدل أن يعيد نتيجة فارغة", () => {
    const span = resolveMonthSpan("2026-08", "2026-06", now);
    expect(span.fromKey).toBe("2026-06");
    expect(span.toKey).toBe("2026-08");
    expect(span.monthKeys).toHaveLength(3);
  });

  it("يتجاهل المفتاح التالف ويعود للشهر الجاري", () => {
    expect(resolveMonthSpan("خربط", "2026-13", now).monthKeys).toEqual(["2026-08"]);
  });

  it("يرفض المدى الأطول من السقف", () => {
    expect(() => resolveMonthSpan("2000-01", "2026-08", now)).toThrow(/شهرًا/);
    expect(resolveMonthSpan("2024-09", "2026-08", now).monthKeys).toHaveLength(MAX_FINANCIAL_MONTHS);
  });
});

describe("معادلة المتبقي للمؤسسة", () => {
  it("تخصم العمولة المستحقة والمصروفات معًا", () => {
    expect(organizationContribution({ netSales: 1000, commissionAccrued: 300, expensesTotal: 120 })).toBe(580);
  });

  it("تسمح بالسالب ولا تقسم على صفر", () => {
    expect(organizationContribution({ netSales: 100, commissionAccrued: 60, expensesTotal: 90 })).toBe(-50);
    expect(contributionMargin(-50, 0)).toBe(0);
    expect(contributionMargin(580, 1000)).toBe(58);
  });
});

describe("البيان المالي الشهري", () => {
  const prisma = new PrismaClient();
  const now = new Date("2026-08-11T09:00:00.000Z");
  let salonId = "";
  let barberId = "";
  let adminUserId = "";
  const visitIds: string[] = [];
  const expenseIds: string[] = [];
  const payoutIds: string[] = [];

  beforeAll(async () => {
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } })).id;

    // مكوّن عشوائي مع الطابع الزمني: ملفات الاختبار تعمل بالتوازي، والطابع وحده
    // قد يتكرر بين ملفين في نفس المللي ثانية فيصطدم `slug` أو رقم الجوال.
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const salon = await prisma.salon.create({
      data: { organizationId: ORG, name: `فرع البيان ${stamp}`, slug: `finance-${stamp}` },
    });
    salonId = salon.id;

    const barber = await prisma.barber.create({
      data: {
        organizationId: ORG,
        salonId,
        name: `finance-barber-${stamp}`,
        phone: `05${stamp.slice(-8)}`,
        accessPinHash: await hashBarberPin("Tanal@123"),
        commissionEnabled: true,
        commissionRate: 40,
      },
    });
    barberId = barber.id;

    // زيارتان في يوليو وواحدة في أغسطس. الثالثة عند حدّ الشهر بتوقيت UTC وتنتمي
    // لأغسطس بتوقيت الرياض — وهذا بالضبط ما يجب أن يلتقطه التقسيم.
    const visits = [
      { visitedAt: "2026-07-05T10:00:00.000Z", gross: 200, discount: 20, net: 180, commission: 72, method: "CASH" as const },
      { visitedAt: "2026-07-20T10:00:00.000Z", gross: 100, discount: 0, net: 100, commission: 40, method: "NETWORK" as const },
      { visitedAt: "2026-07-31T21:30:00.000Z", gross: 300, discount: 0, net: 300, commission: 120, method: "CASH" as const },
    ];
    for (const [index, visit] of visits.entries()) {
      const created = await prisma.visit.create({
        data: {
          organizationId: ORG,
          salonId,
          barberId,
          status: "COMPLETED",
          grossAmount: visit.gross,
          discountAmount: visit.discount,
          netAmount: visit.net,
          commissionAmount: visit.commission,
          paymentMethod: visit.method,
          visitedAt: new Date(visit.visitedAt),
          idempotencyKey: `finance-${stamp}-${index}`,
        },
      });
      visitIds.push(created.id);
    }

    // زيارة ملغاة في يوليو: يجب ألا تدخل أي رقم.
    const cancelled = await prisma.visit.create({
      data: {
        organizationId: ORG,
        salonId,
        barberId,
        status: "CANCELLED",
        grossAmount: 500,
        discountAmount: 0,
        netAmount: 500,
        commissionAmount: 200,
        paymentMethod: "CASH",
        visitedAt: new Date("2026-07-10T10:00:00.000Z"),
        idempotencyKey: `finance-${stamp}-cancelled`,
      },
    });
    visitIds.push(cancelled.id);

    // مصروف يوليو أُدخل في أغسطس: ينتمي ليوليو بتاريخه التشغيلي.
    const expense = await prisma.cashExpense.create({
      data: {
        organizationId: ORG,
        salonId,
        amount: 50,
        category: "SUPPLIES",
        paymentSource: "EXTERNAL",
        note: "مستلزمات يوليو",
        expenseDate: new Date("2026-07-28T09:00:00.000Z"),
        createdAt: new Date("2026-08-02T09:00:00.000Z"),
      },
    });
    expenseIds.push(expense.id);

    // صرف عمولة في أغسطس عن استحقاق يوليو — حركة نقدية لا مصروف.
    const payout = await prisma.commissionPayout.create({
      data: {
        organizationId: ORG,
        salonId,
        barberId,
        periodFrom: new Date("2026-07-01T00:00:00.000Z"),
        periodTo: new Date("2026-07-31T00:00:00.000Z"),
        amount: 90,
        method: "BANK_TRANSFER",
        reference: `TRX-${stamp}`,
        accruedSnapshot: 232,
        paidBeforeSnapshot: 0,
        outstandingAfter: 142,
        paidByUserId: adminUserId,
        paidAt: new Date("2026-08-03T09:00:00.000Z"),
        idempotencyKey: `finance-payout-${stamp}`,
      },
    });
    payoutIds.push(payout.id);
  }, 60000);

  afterAll(async () => {
    await prisma.commissionPayout.deleteMany({ where: { id: { in: payoutIds } } });
    await prisma.cashExpense.deleteMany({ where: { id: { in: expenseIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: visitIds } } });
    await prisma.barber.deleteMany({ where: { id: barberId } });
    await prisma.salon.deleteMany({ where: { id: salonId } });
    await prisma.$disconnect();
  });

  it("يوزّع الحركة على أشهر الرياض ويستثني الملغاة", async () => {
    const report = await getFinancialPeriodReport(prisma, {
      organizationId: ORG,
      salonIds: [salonId],
      fromKey: "2026-07",
      toKey: "2026-08",
      now,
    });

    expect(report.months.map((month) => month.monthKey)).toEqual(["2026-07", "2026-08"]);

    const july = report.months[0];
    expect(july.visitsCount).toBe(2);
    expect(july.grossSales).toBe(300);
    expect(july.discounts).toBe(20);
    expect(july.netSales).toBe(280);
    expect(july.cashSales).toBe(180);
    expect(july.cardSales).toBe(100);
    expect(july.commissionAccrued).toBe(112);
    // المصروف أُدخل في أغسطس وتاريخه التشغيلي يوليو.
    expect(july.expensesTotal).toBe(50);
    expect(july.expensesExternal).toBe(50);
    expect(july.contribution).toBe(118);

    const august = report.months[1];
    // الزيارة عند 21:30 UTC من 31 يوليو تقع في أغسطس بتوقيت الرياض.
    expect(august.visitsCount).toBe(1);
    expect(august.netSales).toBe(300);
    expect(august.commissionAccrued).toBe(120);
    expect(august.expensesTotal).toBe(0);
    expect(august.contribution).toBe(180);
  }, 30000);

  it("يعرض الصرف كحركة نقدية لا كمصروف يخصم الربح مرتين", async () => {
    const report = await getFinancialPeriodReport(prisma, {
      organizationId: ORG,
      salonIds: [salonId],
      fromKey: "2026-07",
      toKey: "2026-08",
      now,
    });

    expect(report.months[0].commissionPaid).toBe(0);
    expect(report.months[1].commissionPaid).toBe(90);
    // دَين العمولات في أغسطس: استُحق 120 وصُرف 90.
    expect(report.months[1].commissionBalanceDelta).toBe(30);
    // الصرف لا يظهر في المصروفات ولا يغيّر المتبقي للمؤسسة.
    expect(report.months[1].expensesTotal).toBe(0);
    expect(report.totals.contribution).toBe(298);
    expect(report.totals.commissionPaid).toBe(90);
  }, 30000);

  it("يُظهر الشهر الخالي بصفر بدل أن يحذفه من الجدول", async () => {
    const report = await getFinancialPeriodReport(prisma, {
      organizationId: ORG,
      salonIds: [salonId],
      fromKey: "2026-05",
      toKey: "2026-08",
      now,
    });

    expect(report.monthsCount).toBe(4);
    expect(report.months.map((month) => month.monthKey)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(report.months[0].netSales).toBe(0);
    expect(report.months[0].contribution).toBe(0);
    expect(report.best?.monthKey).toBe("2026-08");
  }, 30000);

  it("يعيد صفرًا لفرع خارج النطاق — عزل المستأجرين والفروع", async () => {
    const report = await getFinancialPeriodReport(prisma, {
      organizationId: "org_does_not_exist",
      salonIds: [salonId],
      fromKey: "2026-07",
      toKey: "2026-08",
      now,
    });
    expect(report.totals.netSales).toBe(0);
    expect(report.totals.commissionPaid).toBe(0);
  }, 30000);

  it("يوازن حركة العمولة: أول المدة + المستحق − المصروف = آخر المدة", async () => {
    const movement = await getCommissionMovement(prisma, {
      organizationId: ORG,
      salonIds: [salonId],
      fromKey: "2026-07",
      toKey: "2026-08",
      now,
    });

    const row = movement.rows.find((entry) => entry.barberId === barberId);
    expect(row).toBeDefined();
    expect(row!.opening).toBe(0);
    expect(row!.accrued).toBe(232);
    expect(row!.paid).toBe(90);
    expect(row!.closing).toBe(142);
    expect(row!.visitsCount).toBe(3);
  }, 30000);

  it("ينقل رصيد ما قبل المدة إلى أول المدة", async () => {
    const movement = await getCommissionMovement(prisma, {
      organizationId: ORG,
      salonIds: [salonId],
      fromKey: "2026-08",
      toKey: "2026-08",
      now,
    });

    const row = movement.rows.find((entry) => entry.barberId === barberId);
    // يوليو: استُحق 112 ولم يُصرف شيء → رصيد أول أغسطس 112.
    expect(row!.opening).toBe(112);
    expect(row!.accrued).toBe(120);
    expect(row!.paid).toBe(90);
    expect(row!.closing).toBe(142);
  }, 30000);
});
