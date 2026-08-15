import path from "node:path";
import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
import type { ReceiptData } from "@/lib/invoicing/receipt";

const COLORS = {
  ink: "#15111f",
  onyx: "#09070f",
  purple: "#7c3aed",
  purpleDark: "#4c1d95",
  purpleLight: "#ede9fe",
  muted: "#625d6b",
  line: "#ddd6ee",
  pearl: "#f9f7fc",
  white: "#ffffff",
  ruby: "#7f2d35",
};

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const contentWidth = PAGE.width - PAGE.margin * 2;

export async function generateReceiptPdf(receipt: ReceiptData) {
  const regularFont = resolveArabicFont("IBMPlexSansArabic-Regular.woff");
  const boldFont = resolveArabicFont("IBMPlexSansArabic-Bold.woff");
  const resolvedLogoPath = path.join(process.cwd(), "public", "icons", "xmansx-icon-192.png");
  // الشعار تجميلي، فلا ينبغي أن يُسقط الإيصال كله إذا لم تنسخه بيئة نشر
  // standalone. الخطوط إلزامية للعربية، أما الشعار فله بديل رسومي آمن.
  const logoPath = existsSync(resolvedLogoPath) ? resolvedLogoPath : null;

  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    bufferPages: true,
    info: {
      Title: `${receipt.documentTitle} ${receipt.invoiceNumber ?? ""}`.trim(),
      Author: receipt.seller.salonName || receipt.seller.name || "إكس مانس إكس XMANSX",
      Subject: "إيصال مبيعات للخدمات المقدمة",
      Creator: "إكس مانس إكس XMANSX Salon Operations Platform",
      Producer: "إكس مانس إكس XMANSX",
    },
  });

  doc.registerFont("Arabic", regularFont);
  doc.registerFont("ArabicBold", boldFont);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawHeader(doc, receipt, logoPath);
  let y = drawMetadata(doc, receipt, 146);
  y = drawServicesTable(doc, receipt, y + 22, logoPath);
  drawTotalsAndPayment(doc, receipt, y + 22, logoPath);
  drawPageFooters(doc);
  doc.end();

  return completed;
}

export function receiptPdfFilename(receipt: Pick<ReceiptData, "invoiceNumber">) {
  const number = (receipt.invoiceNumber ?? "receipt").replace(/[^a-zA-Z0-9_-]/g, "-");
  return `XMANSX-sales-receipt-${number}.pdf`;
}

function resolveArabicFont(filename: string) {
  // لا تستخدم require.resolve هنا: محزّم Next.js يحوّله داخل Route Handler إلى
  // رقم وحدة Webpack، ثم يفشل path.dirname في نسخة الإنتاج قبل إنشاء الملف.
  // الحزمة dependency تشغيلية ثابتة، لذا يكون مسارها من جذر التطبيق ثابتًا
  // ويعمل في next dev وnext start على حد سواء.
  return path.join(
    process.cwd(),
    "node_modules",
    "@ibm",
    "plex-sans-arabic",
    "fonts",
    "complete",
    "woff",
    filename,
  );
}

function drawHeader(doc: PDFKit.PDFDocument, receipt: ReceiptData, logoPath: string | null) {
  doc.save();
  doc.rect(0, 0, PAGE.width, 122).fill(COLORS.onyx);
  doc.polygon([0, 0], [210, 0], [145, 122], [0, 122]).fill(COLORS.purpleDark);
  doc.opacity(0.28).circle(40, 15, 95).fill(COLORS.purple).opacity(1);
  drawBrandMark(doc, logoPath, 47, 27, 68);

  const sellerName = receipt.seller.salonName || receipt.seller.name || receipt.seller.organizationName || "الصالون";
  arabicText(doc, sellerName, 245, 27, 302, { font: "ArabicBold", size: 21, color: COLORS.white });
  const sellerSubtitle = [
    receipt.seller.organizationName && receipt.seller.organizationName !== sellerName ? receipt.seller.organizationName : "",
    receipt.seller.city,
  ].filter(Boolean).join(" · ");
  if (sellerSubtitle) {
    arabicText(doc, sellerSubtitle, 245, 57, 302, { size: 10, color: "#d8d2e3" });
  }
  arabicText(doc, receipt.documentTitle, 347, 83, 200, { font: "ArabicBold", size: 13, color: "#c4b5fd" });
  latinText(doc, "SALES RECEIPT", 245, 85, 96, { size: 8, color: "#a89fb6", align: "left" });
  doc.restore();
}

function drawMetadata(doc: PDFKit.PDFDocument, receipt: ReceiptData, startY: number) {
  const date = new Date(receipt.visitedAt);
  const day = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    weekday: "long",
    timeZone: "Asia/Riyadh",
  }).format(date);
  const dateText = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(date);
  const timeText = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Riyadh",
  }).format(date);

  doc.roundedRect(PAGE.margin, startY, contentWidth, 104, 10).fillAndStroke(COLORS.pearl, COLORS.line);
  doc.rect(PAGE.width - PAGE.margin - 4, startY + 12, 4, 80).fill(COLORS.purple);

  const rightX = 318;
  const leftX = 70;
  metadataRow(doc, "رقم الإيصال", receipt.invoiceNumber ?? "-", rightX, startY + 17, 224, true);
  metadataRow(doc, "اليوم", day, rightX, startY + 45, 224);
  metadataRow(doc, "التاريخ والوقت", `${dateText}  ·  ${timeText}`, rightX, startY + 73, 224, true);

  metadataRow(doc, "العميل", receipt.customer.name || "عميل زائر", leftX, startY + 17, 220);
  metadataRow(doc, "مقدم الخدمة", receipt.barber.name, leftX, startY + 45, 220);
  metadataRow(doc, "حالة الإيصال", receipt.status === "CANCELLED" ? "ملغى" : "مكتمل", leftX, startY + 73, 220);

  if (receipt.status === "CANCELLED") {
    doc.save().rotate(-18, { origin: [PAGE.width / 2, startY + 52] });
    arabicText(doc, "ملغى", PAGE.width / 2 - 80, startY + 32, 160, { font: "ArabicBold", size: 34, color: COLORS.ruby, align: "center" });
    doc.restore();
  }

  return startY + 104;
}

function metadataRow(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  valueIsLatin = false,
) {
  arabicText(doc, label, x, y, width, { font: "ArabicBold", size: 8, color: COLORS.muted });
  if (valueIsLatin) latinText(doc, value, x, y + 11, width, { size: 10, color: COLORS.ink, align: "right" });
  else arabicText(doc, value, x, y + 11, width, { font: "ArabicBold", size: 10, color: COLORS.ink });
}

function drawServicesTable(doc: PDFKit.PDFDocument, receipt: ReceiptData, startY: number, logoPath: string | null) {
  let y = startY;
  y = drawTableHeader(doc, y);

  const rows = receipt.services.length > 0
    ? receipt.services
    : [{ name: "خدمة", quantity: 1, unitPrice: receipt.totals.grossAmount, lineTotal: receipt.totals.grossAmount }];

  rows.forEach((service, index) => {
    if (y + 42 > 705) {
      doc.addPage();
      drawContinuationHeader(doc, receipt, logoPath);
      y = drawTableHeader(doc, 92);
    }

    const rowHeight = 38;
    if (index % 2 === 0) doc.rect(PAGE.margin, y, contentWidth, rowHeight).fill("#fcfbff");
    doc.moveTo(PAGE.margin, y + rowHeight).lineTo(PAGE.width - PAGE.margin, y + rowHeight).strokeColor(COLORS.line).lineWidth(0.6).stroke();

    arabicText(doc, service.name, 301, y + 12, 238, { font: "ArabicBold", size: 10, color: COLORS.ink });
    latinText(doc, formatNumber(service.quantity), 242, y + 12, 48, { size: 9, color: COLORS.ink, align: "center" });
    latinText(doc, formatAmount(service.unitPrice), 143, y + 12, 88, { size: 9, color: COLORS.ink, align: "right" });
    latinText(doc, formatAmount(service.lineTotal), 52, y + 11, 78, { font: "Helvetica-Bold", size: 10, color: COLORS.purpleDark, align: "right" });
    y += rowHeight;
  });

  return y;
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  doc.roundedRect(PAGE.margin, y, contentWidth, 32, 6).fill(COLORS.purpleDark);
  arabicText(doc, "الخدمة أو المنتج", 301, y + 10, 238, { font: "ArabicBold", size: 9, color: COLORS.white });
  arabicText(doc, "الكمية", 242, y + 10, 48, { font: "ArabicBold", size: 8, color: COLORS.white, align: "center" });
  arabicText(doc, "سعر الوحدة", 143, y + 10, 88, { font: "ArabicBold", size: 8, color: COLORS.white, align: "center" });
  arabicText(doc, "الإجمالي", 52, y + 10, 78, { font: "ArabicBold", size: 8, color: COLORS.white, align: "center" });
  return y + 32;
}

function drawTotalsAndPayment(doc: PDFKit.PDFDocument, receipt: ReceiptData, startY: number, logoPath: string | null) {
  let y = startY;
  if (y + 220 > 760) {
    doc.addPage();
    drawContinuationHeader(doc, receipt, logoPath);
    y = 100;
  }

  const totalsX = 270;
  const totalsWidth = 277;
  doc.roundedRect(totalsX, y, totalsWidth, receipt.totals.discountAmount > 0 ? 112 : 86, 9).fillAndStroke(COLORS.pearl, COLORS.line);
  summaryRow(doc, "الإجمالي قبل الخصم", receipt.totals.grossAmount, totalsX + 15, y + 16, totalsWidth - 30);
  let rowY = y + 42;
  if (receipt.totals.discountAmount > 0) {
    summaryRow(doc, "الخصم", -receipt.totals.discountAmount, totalsX + 15, rowY, totalsWidth - 30, COLORS.ruby);
    rowY += 27;
  }
  doc.moveTo(totalsX + 15, rowY - 6).lineTo(totalsX + totalsWidth - 15, rowY - 6).strokeColor(COLORS.line).stroke();
  arabicText(doc, "المبلغ المدفوع", totalsX + 114, rowY + 4, totalsWidth - 130, { font: "ArabicBold", size: 12, color: COLORS.ink });
  latinText(doc, `${formatAmount(receipt.totals.netAmount)} SAR`, totalsX + 15, rowY + 2, 104, { font: "Helvetica-Bold", size: 14, color: COLORS.purpleDark, align: "left" });

  const paymentBoxHeight = receipt.paymentMethod === "CASH" && receipt.cashTenderedAmount != null ? 112 : 82;
  doc.roundedRect(PAGE.margin, y, 202, paymentBoxHeight, 9).fillAndStroke(COLORS.white, COLORS.line);
  arabicText(doc, "طريقة الدفع", PAGE.margin + 18, y + 16, 166, { font: "ArabicBold", size: 9, color: COLORS.muted });
  arabicText(doc, receipt.paymentMethod === "CASH" ? "نقدًا" : "شبكة / بطاقة", PAGE.margin + 18, y + 34, 166, { font: "ArabicBold", size: 14, color: COLORS.purpleDark });
  if (receipt.paymentMethod === "CASH" && receipt.cashTenderedAmount != null) {
    summaryRow(doc, "المستلم", receipt.cashTenderedAmount, PAGE.margin + 18, y + 66, 166);
    summaryRow(doc, "الباقي", receipt.cashChangeAmount ?? 0, PAGE.margin + 18, y + 88, 166);
  }

  const noteY = y + Math.max(paymentBoxHeight, receipt.totals.discountAmount > 0 ? 112 : 86) + 24;
  doc.roundedRect(PAGE.margin, noteY, contentWidth, 62, 8).fill(COLORS.purpleLight);
  arabicText(doc, "شكرًا لاختياركم لنا", PAGE.margin + 20, noteY + 13, contentWidth - 40, { font: "ArabicBold", size: 12, color: COLORS.purpleDark, align: "center" });
  arabicText(doc, "هذا المستند إيصال مبيعات غير ضريبي ولا يتضمن ضريبة القيمة المضافة.", PAGE.margin + 20, noteY + 35, contentWidth - 40, { size: 8, color: COLORS.muted, align: "center" });
}

function summaryRow(
  doc: PDFKit.PDFDocument,
  label: string,
  amount: number,
  x: number,
  y: number,
  width: number,
  color = COLORS.ink,
) {
  arabicText(doc, label, x + 102, y, width - 102, { font: "ArabicBold", size: 9, color });
  latinText(doc, `${amount < 0 ? "- " : ""}${formatAmount(Math.abs(amount))} SAR`, x, y, 100, { size: 9, color, align: "left" });
}

function drawContinuationHeader(doc: PDFKit.PDFDocument, receipt: ReceiptData, logoPath: string | null) {
  doc.rect(0, 0, PAGE.width, 62).fill(COLORS.onyx);
  drawBrandMark(doc, logoPath, PAGE.margin, 13, 36);
  arabicText(doc, receipt.seller.salonName || receipt.seller.name, 258, 14, 289, { font: "ArabicBold", size: 13, color: COLORS.white });
  latinText(doc, receipt.invoiceNumber ?? "-", 112, 19, 130, { font: "Helvetica-Bold", size: 9, color: "#c4b5fd", align: "left" });
}

function drawBrandMark(doc: PDFKit.PDFDocument, logoPath: string | null, x: number, y: number, size: number) {
  if (logoPath) {
    doc.image(logoPath, x, y, { fit: [size, size], align: "center", valign: "center" });
    return;
  }

  doc.save();
  doc.roundedRect(x, y, size, size, Math.max(7, size * 0.18)).fill(COLORS.purple);
  latinText(doc, "X", x, y + size * 0.19, size, {
    font: "Helvetica-Bold",
    size: size * 0.48,
    color: COLORS.white,
    align: "center",
  });
  doc.restore();
}

function drawPageFooters(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.moveTo(PAGE.margin, 796).lineTo(PAGE.width - PAGE.margin, 796).strokeColor(COLORS.line).lineWidth(0.6).stroke();
    arabicText(doc, "أُصدر إلكترونيًا عبر منصة إكس مانس إكس", 322, 807, 225, { size: 7.5, color: COLORS.muted });
    latinText(doc, "XMANSX", 266, 807, 52, { font: "Helvetica-Bold", size: 7.5, color: COLORS.purpleDark, align: "right" });
    latinText(doc, `${index - range.start + 1} / ${range.count}`, PAGE.margin, 807, 100, { size: 7.5, color: COLORS.muted, align: "left" });
  }
}

function arabicText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options: { font?: string; size?: number; color?: string; align?: "left" | "center" | "right" } = {},
) {
  doc
    .font(options.font ?? "Arabic")
    .fontSize(options.size ?? 10)
    .fillColor(options.color ?? COLORS.ink)
    .text(text, x, y, { width, align: options.align ?? "right", lineBreak: false, features: ["kern", "liga", "calt"] });
}

function latinText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options: { font?: string; size?: number; color?: string; align?: "left" | "center" | "right" } = {},
) {
  doc
    .font(options.font ?? "Helvetica")
    .fontSize(options.size ?? 9)
    .fillColor(options.color ?? COLORS.ink)
    .text(text, x, y, { width, align: options.align ?? "right", lineBreak: false });
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
