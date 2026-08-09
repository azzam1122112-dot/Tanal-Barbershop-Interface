import { describe, expect, it } from "vitest";
import { addMonths, computeNextPeriod, PAYMENT_PROVIDER_LABELS } from "../lib/billing/billing-service";

describe("حساب فترة الاشتراك", () => {
  const now = new Date("2026-08-06T00:00:00.000Z");

  it("يبدأ من اليوم لمؤسسة بلا اشتراك سابق", () => {
    const { periodStart, periodEnd } = computeNextPeriod(null, 1, now);
    expect(periodStart.toISOString()).toBe(now.toISOString());
    expect(periodEnd.getMonth()).toBe(8); // سبتمبر
  });

  it("يمدّد من نهاية الفترة الحالية عند التجديد المبكر", () => {
    // يجدّد قبل 20 يومًا من الانتهاء: لا يجوز أن يخسر الأيام المدفوعة.
    const currentEnd = new Date("2026-08-26T00:00:00.000Z");
    const { periodStart, periodEnd } = computeNextPeriod(currentEnd, 1, now);
    expect(periodStart.toISOString()).toBe(currentEnd.toISOString());
    expect(periodEnd.getTime()).toBeGreaterThan(currentEnd.getTime());
    expect(periodEnd.getMonth()).toBe(8);
  });

  it("يبدأ من اليوم إذا كانت الفترة السابقة منتهية", () => {
    const expired = new Date("2026-07-01T00:00:00.000Z");
    const { periodStart } = computeNextPeriod(expired, 1, now);
    expect(periodStart.toISOString()).toBe(now.toISOString());
  });

  it("يحسب الاشتراك السنوي بشهور متعددة", () => {
    const { periodStart, periodEnd } = computeNextPeriod(null, 12, now);
    expect(periodEnd.getFullYear()).toBe(periodStart.getFullYear() + 1);
    expect(periodEnd.getMonth()).toBe(periodStart.getMonth());
  });

  it("يعامل المدة غير الصحيحة كشهر واحد", () => {
    expect(computeNextPeriod(null, 0, now).periodEnd.getMonth()).toBe(8);
    expect(computeNextPeriod(null, -3, now).periodEnd.getMonth()).toBe(8);
  });
});

describe("إضافة الشهور مع نهايات الشهور القصيرة", () => {
  it("يضبط 31 يناير + شهر إلى آخر فبراير لا إلى مارس", () => {
    const result = addMonths(new Date(2026, 0, 31), 1);
    expect(result.getMonth()).toBe(1); // فبراير
    expect(result.getDate()).toBe(28);
  });

  it("يحترم فبراير في السنة الكبيسة", () => {
    const result = addMonths(new Date(2028, 0, 31), 1);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(29);
  });

  it("يبقي اليوم كما هو للشهور الطويلة", () => {
    const result = addMonths(new Date(2026, 2, 15), 2);
    expect(result.getMonth()).toBe(4); // مايو
    expect(result.getDate()).toBe(15);
  });

  it("يعبر حدّ السنة بشكل صحيح", () => {
    const result = addMonths(new Date(2026, 10, 15), 3);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(1);
  });
});

describe("طرق التحصيل", () => {
  it("لكل طريقة تسمية عربية", () => {
    expect(Object.keys(PAYMENT_PROVIDER_LABELS)).toHaveLength(2);
    expect(PAYMENT_PROVIDER_LABELS.MANUAL_TRANSFER).toBe("تحويل بنكي");
    expect(PAYMENT_PROVIDER_LABELS.MANUAL_CASH).toBe("نقدًا");
  });
});
