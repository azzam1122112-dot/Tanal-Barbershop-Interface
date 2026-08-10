import { describe, expect, it } from "vitest";
import { formatInvoiceNumber } from "../lib/invoicing/invoice-number";
import { evaluateSubscription } from "../lib/plans/subscription-guard";

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
    const state = evaluateSubscription({ ...base, subscriptionStatus: "TRIALING", trialEndsAt: new Date("2026-08-05T00:00:00.000Z") }, now);
    expect(state.canOperate).toBe(false);
  });

  it("يبقي الاشتراك الملغى فعّالًا حتى نهاية المدة المدفوعة", () => {
    const state = evaluateSubscription({ ...base, subscriptionStatus: "CANCELED", currentPeriodEnd: new Date("2026-09-06T00:00:00.000Z") }, now);
    expect(state.canOperate).toBe(true);
  });
});
