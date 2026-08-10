import { describe, expect, it } from "vitest";
import { calculateVisitTotals, readVatSettings } from "../lib/loyalty/calculations";
import { formatInvoiceNumber } from "../lib/invoicing/invoice-number";
import { evaluateSubscription } from "../lib/plans/subscription-guard";

describe("ضريبة القيمة المضافة الاختيارية", () => {
  it("لا تغيّر شيئًا عندما تكون معطّلة (سلوك النظام السابق)", () => {
    const totals = calculateVisitTotals({ grossAmount: 100, discountAmount: 20 });
    expect(totals.netAmount).toBe(80);
    expect(totals.subtotalAmount).toBe(80);
    expect(totals.vatAmount).toBe(0);
    expect(totals.vatRate).toBe(0);
    expect(totals.pointsEarned).toBe(80);
  });

  it("تستخرج الضريبة من المبلغ عندما تكون الأسعار شاملة", () => {
    const totals = calculateVisitTotals({
      grossAmount: 115,
      discountAmount: 0,
      vatEnabled: true,
      vatRate: 15,
      vatInclusive: true,
    });
    // المبلغ المدفوع لا يتغيّر؛ الضريبة تُستخرج منه.
    expect(totals.netAmount).toBe(115);
    expect(totals.vatAmount).toBe(15);
    expect(totals.subtotalAmount).toBe(100);
    expect(totals.subtotalAmount + totals.vatAmount).toBe(totals.netAmount);
  });

  it("تضيف الضريبة فوق المبلغ عندما تكون الأسعار غير شاملة", () => {
    const totals = calculateVisitTotals({
      grossAmount: 100,
      discountAmount: 0,
      vatEnabled: true,
      vatRate: 15,
      vatInclusive: false,
    });
    expect(totals.subtotalAmount).toBe(100);
    expect(totals.vatAmount).toBe(15);
    expect(totals.netAmount).toBe(115);
  });

  it("تطبّق الخصم قبل الضريبة", () => {
    const totals = calculateVisitTotals({
      grossAmount: 230,
      discountAmount: 115,
      vatEnabled: true,
      vatRate: 15,
      vatInclusive: true,
    });
    expect(totals.netAmount).toBe(115);
    expect(totals.vatAmount).toBe(15);
    expect(totals.subtotalAmount).toBe(100);
  });

  it("تحتسب النقاط على المبلغ قبل الضريبة لا بعدها", () => {
    const withVat = calculateVisitTotals({
      grossAmount: 115,
      vatEnabled: true,
      vatRate: 15,
      vatInclusive: true,
    });
    const withoutVat = calculateVisitTotals({ grossAmount: 100 });
    expect(withVat.pointsEarned).toBe(withoutVat.pointsEarned);
    expect(withVat.pointsEarned).toBe(100);
  });

  it("تحتسب النقاط قبل الخصم على مبلغ مجرّد من الضريبة", () => {
    const totals = calculateVisitTotals({
      grossAmount: 115,
      discountAmount: 57.5,
      pointsCalculatedAfterDiscount: false,
      vatEnabled: true,
      vatRate: 15,
      vatInclusive: true,
    });
    expect(totals.pointsEarned).toBe(100);
  });

  it("تتجاهل التفعيل إذا كانت النسبة صفرًا", () => {
    const totals = calculateVisitTotals({ grossAmount: 100, vatEnabled: true, vatRate: 0 });
    expect(totals.vatAmount).toBe(0);
    expect(totals.vatRate).toBe(0);
    expect(totals.netAmount).toBe(100);
  });

  it("تقرأ إعدادات الضريبة بأمان من قيم ناقصة", () => {
    expect(readVatSettings(null)).toEqual({ vatEnabled: false, vatRate: 0, vatInclusive: true });
    expect(readVatSettings({ vatEnabled: true, vatRate: 15, vatInclusive: false })).toEqual({
      vatEnabled: true,
      vatRate: 15,
      vatInclusive: false,
    });
  });
});

describe("ترقيم الإيصالات", () => {
  it("يبني رقمًا تسلسليًا مُصفَّرًا", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("INV-2026-000001");
    expect(formatInvoiceNumber(2026, 4321)).toBe("INV-2026-004321");
  });
});

describe("حارس الاشتراك", () => {
  const now = new Date("2026-08-06T00:00:00.000Z");
  const base = { id: "org", status: "ACTIVE" as const, trialEndsAt: null, currentPeriodEnd: null };

  it("يسمح بالتشغيل على اشتراك فعّال", () => {
    const state = evaluateSubscription({ ...base, subscriptionStatus: "ACTIVE" }, now);
    expect(state.canOperate).toBe(true);
    expect(state.blockReason).toBeNull();
  });

  it("يوقف التشغيل بعد انتهاء الفترة التجريبية", () => {
    const state = evaluateSubscription(
      { ...base, subscriptionStatus: "TRIALING", trialEndsAt: new Date("2026-08-05T00:00:00.000Z") },
      now,
    );
    expect(state.canOperate).toBe(false);
    expect(state.blockReason).toContain("انتهت الفترة التجريبية");
  });

  it("يحذّر قبل انتهاء التجربة دون منع", () => {
    const state = evaluateSubscription(
      { ...base, subscriptionStatus: "TRIALING", trialEndsAt: new Date("2026-08-09T00:00:00.000Z") },
      now,
    );
    expect(state.canOperate).toBe(true);
    expect(state.warning).toContain("تنتهي فترتك التجريبية");
    expect(state.daysLeft).toBe(3);
  });

  it("يوقف التشغيل عند عدم تفعيل الاشتراك", () => {
    const state = evaluateSubscription({ ...base, subscriptionStatus: "PAST_DUE" }, now);
    expect(state.canOperate).toBe(false);
    expect(state.blockReason).toContain("غير فعّال");
  });

  it("يوقف التشغيل للاشتراك الملغى وللمؤسسة الموقوفة", () => {
    expect(evaluateSubscription({ ...base, subscriptionStatus: "CANCELED" }, now).canOperate).toBe(false);
    expect(
      evaluateSubscription({ ...base, status: "SUSPENDED", subscriptionStatus: "ACTIVE" }, now).canOperate,
    ).toBe(false);
  });

  it("يبقي الاشتراك الملغى فعّالًا حتى نهاية المدة المدفوعة", () => {
    const state = evaluateSubscription(
      { ...base, subscriptionStatus: "CANCELED", currentPeriodEnd: new Date("2026-09-06T00:00:00.000Z") },
      now,
    );
    expect(state.canOperate).toBe(true);
    expect(state.warning).toContain("تم إلغاء التجديد");
  });
});
