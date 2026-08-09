import { describe, expect, it } from "vitest";
import { calculateVisitTotals, readVatSettings } from "../lib/loyalty/calculations";
import { buildZatcaTlvBase64, buildQrSvg } from "../lib/invoicing/zatca-qr";
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

describe("رمز QR للفاتورة الضريبية المبسّطة", () => {
  const fields = {
    sellerName: "صالون تنال",
    vatNumber: "300000000000003",
    timestamp: new Date("2026-08-06T10:30:00.000Z"),
    totalWithVat: 115,
    vatTotal: 15,
  };

  it("يرمّز الحقول الخمسة بصيغة TLV صحيحة", () => {
    const decoded = Buffer.from(buildZatcaTlvBase64(fields), "base64");

    const tags: Array<{ tag: number; value: string }> = [];
    let offset = 0;
    while (offset < decoded.length) {
      const tag = decoded[offset];
      const length = decoded[offset + 1];
      tags.push({ tag, value: decoded.subarray(offset + 2, offset + 2 + length).toString("utf8") });
      offset += 2 + length;
    }

    expect(tags.map((entry) => entry.tag)).toEqual([1, 2, 3, 4, 5]);
    expect(tags[0].value).toBe("صالون تنال");
    expect(tags[1].value).toBe("300000000000003");
    expect(tags[2].value).toBe("2026-08-06T10:30:00.000Z");
    expect(tags[3].value).toBe("115.00");
    expect(tags[4].value).toBe("15.00");
  });

  it("يستخدم طول البايتات لا طول الأحرف للنص العربي", () => {
    const decoded = Buffer.from(buildZatcaTlvBase64(fields), "base64");
    // "صالون تنال" = 10 محارف لكن 19 بايت في UTF-8.
    expect(decoded[1]).toBe(Buffer.from("صالون تنال", "utf8").length);
    expect(decoded[1]).not.toBe("صالون تنال".length);
  });

  it("يبني SVG مضمّنًا بلا موارد خارجية", () => {
    const svg = buildQrSvg(buildZatcaTlvBase64(fields));
    expect(svg).toContain("<svg");
    // `xmlns` فضاء أسماء XML لا طلب شبكة؛ الممنوع هو تحميل مورد خارجي أو تنفيذ سكربت.
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<image");
    expect(svg).not.toMatch(/(?:href|src)\s*=/i);
    expect(svg).not.toContain("url(");
  });
});

describe("ترقيم الفواتير", () => {
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

  it("يُبقي التشغيل مع تحذير عند تأخر السداد", () => {
    const state = evaluateSubscription({ ...base, subscriptionStatus: "PAST_DUE" }, now);
    expect(state.canOperate).toBe(true);
    expect(state.warning).toContain("مستحق غير مسدّد");
  });

  it("يوقف التشغيل للاشتراك الملغى وللمؤسسة الموقوفة", () => {
    expect(evaluateSubscription({ ...base, subscriptionStatus: "CANCELED" }, now).canOperate).toBe(false);
    expect(
      evaluateSubscription({ ...base, status: "SUSPENDED", subscriptionStatus: "ACTIVE" }, now).canOperate,
    ).toBe(false);
  });
});
