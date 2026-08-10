import { describe, expect, it } from "vitest";
import { calculateVisitCommission, resolveBarberRate } from "../lib/commissions/commission";
import { calculateVisitTotals } from "../lib/loyalty/calculations";

describe("عمولة الحلاق", () => {
  const lines = [
    { serviceId: "s1", lineTotal: 60 },
    { serviceId: "s2", lineTotal: 40 },
  ];

  it("تحسب على المبلغ بعد الخصم", () => {
    const result = calculateVisitCommission({ lines, commissionBase: 100, barberRate: 20 });
    expect(result.totalCommission).toBe(20);
    expect(result.lines.map((line) => line.commissionAmount)).toEqual([12, 8]);
  });

  it("لا تُحتسب على خصم لم يدفعه العميل", () => {
    const totals = calculateVisitTotals({ grossAmount: 100, discountAmount: 40 });
    const result = calculateVisitCommission({
      lines: [{ serviceId: "s1", lineTotal: 100 }],
      commissionBase: totals.netAmount,
      barberRate: 25,
    });
    expect(result.totalCommission).toBe(15);
  });

  it("تحترم أسبقية النسب: الخدمة ثم الحلاق ثم الفرع", () => {
    const result = calculateVisitCommission({
      lines: [
        { serviceId: "s1", lineTotal: 50, serviceRate: 40 },
        { serviceId: "s2", lineTotal: 50 },
      ],
      commissionBase: 100,
      barberRate: 10,
      defaultRate: 5,
    });
    expect(result.lines[0].commissionRate).toBe(40);
    expect(result.lines[1].commissionRate).toBe(10);
    expect(result.totalCommission).toBe(25);

    const withoutBarberRate = calculateVisitCommission({
      lines: [{ serviceId: "s1", lineTotal: 100 }],
      commissionBase: 100,
      defaultRate: 7,
    });
    expect(withoutBarberRate.lines[0].commissionRate).toBe(7);
  });

  it("تعطي صفرًا بلا نسب مضبوطة", () => {
    const result = calculateVisitCommission({ lines, commissionBase: 100 });
    expect(result.totalCommission).toBe(0);
  });

  it("لا تحتسب أي عمولة عند تعطيلها للحلاق حتى مع وجود نسب للخدمة والفرع", () => {
    const result = calculateVisitCommission({
      lines: [
        { serviceId: "s1", lineTotal: 60, serviceRate: 40 },
        { serviceId: "s2", lineTotal: 40 },
      ],
      commissionBase: 100,
      enabled: false,
      barberRate: 25,
      defaultRate: 10,
    });

    expect(result.totalCommission).toBe(0);
    expect(result.lines.map((line) => line.commissionRate)).toEqual([0, 0]);
    expect(result.lines.map((line) => line.commissionAmount)).toEqual([0, 0]);
  });

  it("توزّع بالتساوي عند خدمات بقيمة صفر بدل القسمة على صفر", () => {
    const result = calculateVisitCommission({
      lines: [
        { serviceId: "s1", lineTotal: 0 },
        { serviceId: "s2", lineTotal: 0 },
      ],
      commissionBase: 100,
      barberRate: 10,
    });
    expect(result.totalCommission).toBe(10);
    expect(result.lines.every((line) => Number.isFinite(line.commissionAmount))).toBe(true);
  });

  it("تحدّ النسبة بين صفر ومئة", () => {
    expect(resolveBarberRate(150, 0)).toBe(100);
    expect(resolveBarberRate(-5, 0)).toBe(0);
    expect(resolveBarberRate(null, 12)).toBe(12);
  });
});

describe("أثر المصروفات على تسوية الصندوق", () => {
  // نموذج الحساب نفسه المطبّق في إغلاق الجلسة.
  function reconcile(cashTotal: number, expenses: number, received: number) {
    const expectedCash = Math.round((cashTotal - expenses) * 100) / 100;
    return { expectedCash, difference: Math.round((received - expectedCash) * 100) / 100 };
  }

  it("تجعل الدرج متوازنًا بعد صرف مصروف نثري", () => {
    // بلا مصروفات كان سيظهر عجز 80.
    expect(reconcile(500, 0, 420).difference).toBe(-80);
    // بتسجيل المصروف يصبح الفرق صفرًا ومفسَّرًا.
    expect(reconcile(500, 80, 420)).toEqual({ expectedCash: 420, difference: 0 });
  });

  it("تُبقي العجز ظاهرًا إن لم تفسّره المصروفات", () => {
    expect(reconcile(500, 30, 420).difference).toBe(-50);
  });
});
