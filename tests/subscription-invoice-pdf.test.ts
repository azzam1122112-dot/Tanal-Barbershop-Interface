import { describe, expect, it } from "vitest";
import {
  generateSubscriptionInvoicePdf,
  subscriptionInvoicePdfFilename,
  type SubscriptionInvoiceDocument,
} from "../lib/billing/subscription-invoice-pdf";

export const subscriptionInvoiceFixture: SubscriptionInvoiceDocument = {
  id: "invoice-1",
  invoiceNumber: "XM-2026-000042",
  issuedAt: "2026-08-12T08:30:00.000Z",
  paidAt: "2026-08-12T08:30:00.000Z",
  periodStart: "2026-08-12T08:30:00.000Z",
  periodEnd: "2027-08-12T08:30:00.000Z",
  periodMonths: 12,
  amount: 1750,
  currency: "SAR",
  providerLabel: "تحويل بنكي",
  reference: "TRX-2026-1842",
  sellerName: "منصور محمد بن حامد الغامدي",
  sellerFreelanceDocument: "FL-719915135",
  sellerActivity: "برمجة وتطوير المواقع الإلكترونية",
  planName: "الباقة الاحترافية",
  planDescription: "باقة متكاملة لإدارة الفروع والفريق والعملاء والتقارير التشغيلية.",
  planFeatures: ["إدارة الحجوزات", "تقارير تشغيلية", "برنامج ولاء"],
  planLimits: { maxSalons: 3, maxBarbers: 20, maxCustomers: null },
  buyer: {
    name: "مؤسسة أناقة الرجل",
    city: "الرياض",
    owner: { name: "عبدالله الغامدي", email: "owner@example.com", phone: "0500000000" },
  },
};

describe("فاتورة اشتراك PDF", () => {
  it("ينشئ فاتورة عربية رسمية من صفحة واحدة", async () => {
    const pdf = await generateSubscriptionInvoicePdf(subscriptionInvoiceFixture);

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(25_000);
    expect(pdf.byteLength).toBeLessThan(300_000);
    expect(pdf.toString("latin1")).toContain("/Count 1");
  });

  it("ينشئ اسم ملف ثابتًا وآمنًا", () => {
    expect(subscriptionInvoicePdfFilename(subscriptionInvoiceFixture)).toBe(
      "XMANSX-subscription-invoice-XM-2026-000042.pdf",
    );
  });
});
