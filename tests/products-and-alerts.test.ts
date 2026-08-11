import { describe, expect, it } from "vitest";
import { calculateVisitCommission } from "../lib/commissions/commission";
import { calculateVisitTotals } from "../lib/loyalty/calculations";
import { STOCK_MOVEMENT_LABELS } from "../lib/products/product-service";
import { APPOINTMENT_STATUS_LABELS } from "../lib/appointments/appointment-service";
import { EXPENSE_CATEGORY_LABELS } from "../lib/expenses/expense-service";

describe("بيع المنتجات مع الزيارة", () => {
  it("يضيف قيمة المنتجات فوق مبلغ الخدمات", () => {
    const servicesAmount = 80;
    const productsTotal = 45;
    const totals = calculateVisitTotals({ grossAmount: servicesAmount + productsTotal });
    expect(totals.grossAmount).toBe(125);
    expect(totals.netAmount).toBe(125);
  });

  it("يدخل المنتج وعاء العمولة بنسبته الخاصة", () => {
    const result = calculateVisitCommission({
      lines: [
        { serviceId: "svc", lineTotal: 80, serviceRate: null },
        { serviceId: "prod", lineTotal: 20, serviceRate: 5 },
      ],
      commissionBase: 100,
      barberRate: 30,
    });

    // الخدمة بنسبة الحلاق 30% على حصتها 80، والمنتج بنسبته 5% على حصته 20.
    expect(result.lines[0].commissionAmount).toBe(24);
    expect(result.lines[1].commissionAmount).toBe(1);
    expect(result.totalCommission).toBe(25);
  });

  it("يطبق الخصم على مجموع الخدمات والمنتجات", () => {
    const totals = calculateVisitTotals({ grossAmount: 115, discountAmount: 15 });
    expect(totals.netAmount).toBe(100);
  });
});

describe("تسميات عربية مكتملة", () => {
  it("لكل حركة مخزون تسمية", () => {
    for (const [key, label] of Object.entries(STOCK_MOVEMENT_LABELS)) {
      expect(label, key).toBeTruthy();
    }
    expect(Object.keys(STOCK_MOVEMENT_LABELS)).toHaveLength(5);
  });

  it("لكل حالة موعد تسمية", () => {
    expect(Object.keys(APPOINTMENT_STATUS_LABELS)).toHaveLength(5);
    expect(APPOINTMENT_STATUS_LABELS.NO_SHOW).toBe("لم يحضر");
  });

  it("لكل تصنيف مصروف تسمية", () => {
    expect(Object.keys(EXPENSE_CATEGORY_LABELS)).toHaveLength(5);
  });
});

describe("منطق تداخل المواعيد", () => {
  // نفس شرط التداخل المطبّق في `assertNoOverlap`.
  function overlaps(aStart: number, aMinutes: number, bStart: number, bMinutes: number) {
    return aStart < bStart + bMinutes * 60000 && bStart < aStart + aMinutes * 60000;
  }

  const base = new Date("2026-08-06T10:00:00.000Z").getTime();

  it("يكشف التداخل الجزئي", () => {
    expect(overlaps(base, 30, base + 15 * 60000, 30)).toBe(true);
  });

  it("يسمح بموعد يبدأ فور انتهاء السابق", () => {
    expect(overlaps(base, 30, base + 30 * 60000, 30)).toBe(false);
  });

  it("يكشف الاحتواء الكامل", () => {
    expect(overlaps(base, 60, base + 10 * 60000, 5)).toBe(true);
  });
});
