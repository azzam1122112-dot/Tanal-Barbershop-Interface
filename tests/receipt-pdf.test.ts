import { describe, expect, it } from "vitest";
import type { ReceiptData } from "../lib/invoicing/receipt";
import { generateReceiptPdf, receiptPdfFilename } from "../lib/invoicing/receipt-pdf";

const receipt: ReceiptData = {
  visitId: "visit-1",
  documentTitle: "إيصال مبيعات",
  seller: {
    name: "مؤسسة تَنال للعناية الرجالية",
    organizationName: "مؤسسة تَنال للعناية الرجالية",
    salonName: "فرع حي الملقا",
    city: "الرياض",
  },
  invoiceNumber: "INV-2026-000184",
  visitedAt: "2026-08-10T17:35:00.000Z",
  status: "COMPLETED",
  customer: { name: "محمد الغامدي", phone: "0500000000" },
  barber: { name: "خالد أحمد" },
  services: [
    { name: "قص شعر فاخر", quantity: 1, unitPrice: 65, lineTotal: 65 },
    { name: "تهذيب اللحية", quantity: 1, unitPrice: 45, lineTotal: 45 },
  ],
  totals: { grossAmount: 110, discountAmount: 10, netAmount: 100 },
  paymentMethod: "CASH",
  cashTenderedAmount: 150,
  cashChangeAmount: 50,
  loyalty: { earnedPoints: 10, redeemedPoints: 0, balance: 50 },
};

describe("إيصال المبيعات PDF", () => {
  it("ينشئ ملف PDF عربيًا صالحًا وخفيفًا للمشاركة", async () => {
    const pdf = await generateReceiptPdf(receipt);

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(20_000);
    expect(pdf.byteLength).toBeLessThan(250_000);
  });

  it("ينشئ اسم ملف آمنًا للتنزيل والمشاركة", () => {
    expect(receiptPdfFilename(receipt)).toBe("XMANSX-sales-receipt-INV-2026-000184.pdf");
    expect(receiptPdfFilename({ invoiceNumber: "INV/2026 42" })).toBe("XMANSX-sales-receipt-INV-2026-42.pdf");
  });

  it("يدعم استمرار جدول الخدمات في صفحات إضافية", async () => {
    const pdf = await generateReceiptPdf({
      ...receipt,
      services: Array.from({ length: 30 }, (_, index) => ({
        name: `خدمة العناية رقم ${index + 1}`,
        quantity: 1,
        unitPrice: 10,
        lineTotal: 10,
      })),
      totals: { grossAmount: 300, discountAmount: 0, netAmount: 300 },
    });

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(40_000);
  });
});
