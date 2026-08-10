import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReceiptData } from "../lib/invoicing/receipt";
import { generateReceiptPdf } from "../lib/invoicing/receipt-pdf";

const sample: ReceiptData = {
  visitId: "sample-visit",
  documentTitle: "إيصال مبيعات",
  seller: {
    name: "صالون تَنال للحلاقة الرجالية",
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
    { name: "تهذيب اللحية والعناية", quantity: 1, unitPrice: 45, lineTotal: 45 },
    { name: "قناع تنظيف البشرة", quantity: 1, unitPrice: 35, lineTotal: 35 },
  ],
  totals: { grossAmount: 145, discountAmount: 15, netAmount: 130 },
  paymentMethod: "CASH",
  cashTenderedAmount: 150,
  cashChangeAmount: 20,
  loyalty: { earnedPoints: 13, redeemedPoints: 0, balance: 82 },
};

async function main() {
  const outputDir = path.join(process.cwd(), "output", "pdf");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "xmansx-sales-receipt-sample.pdf");
  await writeFile(outputPath, await generateReceiptPdf(sample));
  console.log(outputPath);
}

void main();
