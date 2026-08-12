import path from "node:path";
import PDFDocument from "pdfkit";

export type SubscriptionInvoiceDocument = {
  id: string;
  invoiceNumber: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodMonths: number;
  amount: number;
  currency: string;
  providerLabel: string;
  reference: string | null;
  sellerName: string | null;
  sellerFreelanceDocument: string | null;
  sellerActivity: string | null;
  planName: string | null;
  planDescription: string | null;
  planFeatures: string[];
  planLimits: { maxSalons: number; maxBarbers: number | null; maxCustomers: number | null } | null;
  buyer: {
    name: string;
    city: string | null;
    owner: { name: string; email: string | null; phone: string } | null;
  };
};

const COLORS = {
  ink: "#17131f",
  onyx: "#0b0811",
  purple: "#7c3aed",
  purpleDark: "#4c1d95",
  purpleLight: "#f2edff",
  muted: "#665f70",
  line: "#ded7ea",
  pearl: "#faf8fd",
  white: "#ffffff",
  green: "#166534",
};

const PAGE = { width: 595.28, height: 841.89, margin: 42 };
const contentWidth = PAGE.width - PAGE.margin * 2;

export async function generateSubscriptionInvoicePdf(invoice: SubscriptionInvoiceDocument) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    info: {
      Title: `فاتورة اشتراك ${invoice.invoiceNumber ?? invoice.id}`,
      Author: "إكس مانس إكس XMANSX",
      Subject: "فاتورة اشتراك برمجية غير ضريبية",
      Creator: "إكس مانس إكس XMANSX",
      Producer: "إكس مانس إكس XMANSX",
    },
  });
  doc.registerFont("Arabic", resolveArabicFont("IBMPlexSansArabic-Regular.woff"));
  doc.registerFont("ArabicBold", resolveArabicFont("IBMPlexSansArabic-Bold.woff"));

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawHeader(doc, invoice);
  drawInvoiceMetadata(doc, invoice);
  drawParties(doc, invoice);
  drawPlan(doc, invoice);
  drawTotals(doc, invoice);
  drawNonTaxNotice(doc);
  drawFooter(doc, invoice);
  doc.end();
  return completed;
}

export function subscriptionInvoicePdfFilename(invoice: Pick<SubscriptionInvoiceDocument, "invoiceNumber" | "id">) {
  const number = (invoice.invoiceNumber ?? invoice.id).replace(/[^a-zA-Z0-9_-]/g, "-");
  return `XMANSX-subscription-invoice-${number}.pdf`;
}

function drawHeader(doc: PDFKit.PDFDocument, invoice: SubscriptionInvoiceDocument) {
  doc.rect(0, 0, PAGE.width, 136).fill(COLORS.onyx);
  doc.polygon([0, 0], [225, 0], [154, 136], [0, 136]).fill(COLORS.purpleDark);
  doc.opacity(0.25).circle(34, 22, 104).fill(COLORS.purple).opacity(1);
  doc.image(path.join(process.cwd(), "public", "icons", "xmansx-icon-192.png"), 47, 27, { fit: [78, 78] });

  arabicText(doc, "إكس مانس إكس", 350, 28, 198, {
    font: "ArabicBold",
    size: 20,
    color: COLORS.white,
  });
  latinText(doc, "XMANSX", 254, 34, 88, { font: "Helvetica-Bold", size: 16, color: COLORS.white, align: "right" });
  arabicText(doc, "فاتورة اشتراك رسمية", 318, 64, 230, {
    font: "ArabicBold",
    size: 14,
    color: "#d8ccff",
  });
  latinText(doc, invoice.invoiceNumber ?? invoice.id, 254, 94, 294, {
    font: "Helvetica-Bold",
    size: 10,
    color: "#a89fb6",
    align: "right",
  });
}

function drawInvoiceMetadata(doc: PDFKit.PDFDocument, invoice: SubscriptionInvoiceDocument) {
  const y = 156;
  doc.roundedRect(PAGE.margin, y, contentWidth, 91, 10).fillAndStroke(COLORS.pearl, COLORS.line);
  doc.rect(PAGE.width - PAGE.margin - 4, y + 11, 4, 69).fill(COLORS.purple);

  metadataRow(doc, "تاريخ إصدار الفاتورة", formatDate(invoice.issuedAt ?? invoice.paidAt), 316, y + 14, 230, true);
  metadataRow(doc, "تاريخ تفعيل الباقة", formatDate(invoice.periodStart), 316, y + 46, 230, true);
  metadataRow(doc, "تاريخ انتهاء الباقة", formatDate(invoice.periodEnd), 63, y + 14, 230, true);
  metadataRow(doc, "حالة السداد", "مدفوعة", 63, y + 46, 230, false, COLORS.green);
}

function drawParties(doc: PDFKit.PDFDocument, invoice: SubscriptionInvoiceDocument) {
  const y = 267;
  const gap = 14;
  const width = (contentWidth - gap) / 2;
  partyBox(doc, PAGE.margin + width + gap, y, width, "مقدم الخدمة", [
    invoice.sellerName ?? "إكس مانس إكس XMANSX",
    invoice.sellerActivity ?? "خدمات برمجية سحابية",
    invoice.sellerFreelanceDocument ? "وثيقة العمل الحر" : "",
    invoice.sellerFreelanceDocument ?? "",
  ]);
  partyBox(doc, PAGE.margin, y, width, "العميل", [
    invoice.buyer.name,
    invoice.buyer.owner?.name ? `المالك: ${invoice.buyer.owner.name}` : "",
    invoice.buyer.city ?? "",
    invoice.buyer.owner?.email ?? "",
  ]);
}

function partyBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  values: string[],
) {
  doc.roundedRect(x, y, width, 113, 9).fillAndStroke(COLORS.white, COLORS.line);
  arabicText(doc, title, x + 16, y + 13, width - 32, { font: "ArabicBold", size: 9, color: COLORS.purpleDark });
  values.filter(Boolean).slice(0, 4).forEach((value, index) => {
    const isLatin = value.includes("@") || /^[A-Za-z0-9._ -]+$/.test(value);
    if (isLatin) latinText(doc, value, x + 16, y + 35 + index * 18, width - 32, { size: 8.5, color: COLORS.muted, align: "right" });
    else arabicText(doc, value, x + 16, y + 35 + index * 18, width - 32, { font: index === 0 ? "ArabicBold" : "Arabic", size: index === 0 ? 10.5 : 8.5, color: index === 0 ? COLORS.ink : COLORS.muted });
  });
}

function drawPlan(doc: PDFKit.PDFDocument, invoice: SubscriptionInvoiceDocument) {
  const y = 400;
  doc.roundedRect(PAGE.margin, y, contentWidth, 139, 10).fillAndStroke(COLORS.pearl, COLORS.line);
  doc.roundedRect(PAGE.width - PAGE.margin - 132, y + 14, 116, 25, 12).fill(COLORS.purpleLight);
  arabicText(doc, "تفاصيل الباقة", PAGE.width - PAGE.margin - 124, y + 21, 100, { font: "ArabicBold", size: 9, color: COLORS.purpleDark, align: "center" });
  arabicText(doc, invoice.planName ?? "اشتراك إكس مانس إكس XMANSX", PAGE.margin + 18, y + 18, contentWidth - 170, { font: "ArabicBold", size: 15, color: COLORS.ink });

  const description = invoice.planDescription?.trim() || `اشتراك لمدة ${invoice.periodMonths} شهر في منصة إدارة الصالونات.`;
  arabicText(doc, description, PAGE.margin + 18, y + 49, contentWidth - 36, { size: 9, color: COLORS.muted, lineBreak: true, height: 28 });

  if (invoice.planLimits) {
    const limits = [
      ["الفروع", formatLimit(invoice.planLimits.maxSalons)],
      ["الحلاقون", formatLimit(invoice.planLimits.maxBarbers)],
      ["العملاء", formatLimit(invoice.planLimits.maxCustomers)],
    ] as const;
    const limitWidth = (contentWidth - 64) / 3;
    limits.forEach(([label, value], index) => {
      const x = PAGE.margin + 18 + index * (limitWidth + 14);
      arabicText(doc, label, x + 45, y + 85, limitWidth - 45, { font: "ArabicBold", size: 8.2, color: COLORS.muted });
      if (/^\d+$/.test(value)) latinText(doc, value, x, y + 85, 40, { font: "Helvetica-Bold", size: 8.5, color: COLORS.ink, align: "left" });
      else arabicText(doc, value, x, y + 85, limitWidth, { font: "ArabicBold", size: 8.2, color: COLORS.ink, align: "left" });
    });
  }
  const features = invoice.planFeatures.filter(Boolean).slice(0, 3).map((feature) => `• ${feature}`);
  features.forEach((detail, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const itemWidth = (contentWidth - 50) / 2;
    const x = PAGE.margin + 18 + column * (itemWidth + 14);
    arabicText(doc, detail, x, y + 111 + row * 16, itemWidth, { font: "ArabicBold", size: 8.2, color: COLORS.ink });
  });
}

function drawTotals(doc: PDFKit.PDFDocument, invoice: SubscriptionInvoiceDocument) {
  const y = 559;
  doc.roundedRect(PAGE.margin, y, contentWidth, 119, 10).fillAndStroke(COLORS.white, COLORS.line);
  summaryRow(doc, "قيمة الاشتراك", invoice.amount, y + 17);
  summaryRow(doc, "ضريبة القيمة المضافة", 0, y + 46, "غير مطبقة");
  doc.moveTo(PAGE.margin + 18, y + 76).lineTo(PAGE.width - PAGE.margin - 18, y + 76).strokeColor(COLORS.line).stroke();
  arabicText(doc, "الإجمالي المدفوع", PAGE.width - PAGE.margin - 210, y + 89, 192, { font: "ArabicBold", size: 12, color: COLORS.ink });
  latinText(doc, `${formatAmount(invoice.amount)} ${invoice.currency}`, PAGE.margin + 18, y + 87, 190, { font: "Helvetica-Bold", size: 15, color: COLORS.purpleDark, align: "left" });
}

function summaryRow(doc: PDFKit.PDFDocument, label: string, amount: number, y: number, override?: string) {
  arabicText(doc, label, PAGE.width - PAGE.margin - 220, y, 202, { font: "ArabicBold", size: 9, color: COLORS.muted });
  if (override) arabicText(doc, override, PAGE.margin + 18, y, 190, { font: "ArabicBold", size: 9, color: COLORS.ink, align: "left" });
  else latinText(doc, `${formatAmount(amount)} SAR`, PAGE.margin + 18, y, 190, { size: 9, color: COLORS.ink, align: "left" });
}

function drawNonTaxNotice(doc: PDFKit.PDFDocument) {
  const y = 697;
  doc.roundedRect(PAGE.margin, y, contentWidth, 58, 9).fill(COLORS.purpleLight);
  arabicText(doc, "فاتورة غير ضريبية", PAGE.margin + 18, y + 11, contentWidth - 36, { font: "ArabicBold", size: 11, color: COLORS.purpleDark, align: "center" });
  arabicText(doc, "لا تُفرض ضريبة القيمة المضافة على هذه الفاتورة، وقيمة الضريبة صفر.", PAGE.margin + 18, y + 32, contentWidth - 36, { size: 8.5, color: COLORS.muted, align: "center" });
}

function drawFooter(doc: PDFKit.PDFDocument, invoice: SubscriptionInvoiceDocument) {
  doc.moveTo(PAGE.margin, 786).lineTo(PAGE.width - PAGE.margin, 786).strokeColor(COLORS.line).lineWidth(0.7).stroke();
  arabicText(doc, `طريقة الدفع: ${invoice.providerLabel}`, 312, 798, 235, { size: 7.5, color: COLORS.muted });
  if (invoice.reference) latinText(doc, `REF: ${invoice.reference}`, PAGE.margin, 798, 250, { size: 7.5, color: COLORS.muted, align: "left" });
  arabicText(doc, "صدرت إلكترونيًا عبر منصة إكس مانس إكس", 287, 814, 260, { size: 7.5, color: COLORS.muted });
  latinText(doc, "support@xmansx.com", PAGE.margin, 814, 220, { size: 7.5, color: COLORS.muted, align: "left" });
}

function metadataRow(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  latin = false,
  color = COLORS.ink,
) {
  arabicText(doc, label, x, y, width, { font: "ArabicBold", size: 8, color: COLORS.muted });
  if (latin) latinText(doc, value, x, y + 13, width, { font: "Helvetica-Bold", size: 10, color, align: "right" });
  else arabicText(doc, value, x, y + 13, width, { font: "ArabicBold", size: 10, color });
}

function resolveArabicFont(filename: string) {
  return path.join(process.cwd(), "node_modules", "@ibm", "plex-sans-arabic", "fonts", "complete", "woff", filename);
}

function arabicText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options: {
    font?: string;
    size?: number;
    color?: string;
    align?: "left" | "center" | "right";
    lineBreak?: boolean;
    height?: number;
  } = {},
) {
  doc.font(options.font ?? "Arabic").fontSize(options.size ?? 10).fillColor(options.color ?? COLORS.ink).text(text, x, y, {
    width,
    height: options.height,
    align: options.align ?? "right",
    lineBreak: options.lineBreak ?? false,
    ellipsis: Boolean(options.height),
    features: ["kern", "liga", "calt"],
  });
}

function latinText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options: { font?: string; size?: number; color?: string; align?: "left" | "center" | "right" } = {},
) {
  doc.font(options.font ?? "Helvetica").fontSize(options.size ?? 9).fillColor(options.color ?? COLORS.ink).text(text, x, y, {
    width,
    align: options.align ?? "right",
    lineBreak: false,
  });
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(new Date(value));
}

function formatAmount(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatLimit(value: number | null) {
  return value === null ? "غير محدود" : value.toLocaleString("en-US");
}
