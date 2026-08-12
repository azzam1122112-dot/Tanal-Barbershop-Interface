import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

type CallToAction = { label: string; url: string };

type CustomerEmailLayoutInput = {
  preheader: string;
  title: string;
  body: string[];
  cta?: CallToAction | null;
  footer?: string;
};

export function renderCustomerEmail(input: CustomerEmailLayoutInput) {
  const safeTitle = escapeHtml(input.title);
  const paragraphs = input.body.map((paragraph) => `<p style="margin:0 0 14px;line-height:1.9">${escapeHtml(paragraph)}</p>`).join("");
  const cta = input.cta
    ? `<a href="${escapeAttribute(assertHttpsUrl(input.cta.url))}" style="display:inline-block;margin-top:8px;border-radius:12px;background:#163a2d;color:#fff;text-decoration:none;padding:12px 22px;font-weight:700">${escapeHtml(input.cta.label)}</a>`
    : "";
  const footer = escapeHtml(input.footer ?? "إكس مانس إكس XMANSX · إدارة الصالونات والعناية بالعملاء");

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#f5f3ed;color:#17221e;font-family:Tahoma,Arial,sans-serif">
    <span style="display:none!important;max-height:0;opacity:0;overflow:hidden">${escapeHtml(input.preheader)}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ed;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e6dfd2;border-radius:18px;overflow:hidden">
          <tr><td style="background:#11271f;color:#fff;padding:24px 28px"><strong style="font-size:22px;letter-spacing:.02em">إكس مانس إكس XMANSX</strong></td></tr>
          <tr><td style="padding:30px 28px">
            <h1 style="margin:0 0 20px;font-size:25px;line-height:1.5;color:#17221e">${safeTitle}</h1>
            ${paragraphs}${cta}
          </td></tr>
          <tr><td style="border-top:1px solid #eee7dc;padding:18px 28px;color:#6f746f;font-size:12px;line-height:1.8">${footer}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [input.title, "", ...input.body, ...(input.cta ? ["", `${input.cta.label}: ${assertHttpsUrl(input.cta.url)}`] : []), "", footer].join("\n");
  return { html, text };
}

export function renderEmailConnectionTest() {
  return renderCustomerEmail({
    preheader: "تم ربط XMANSX بخدمة البريد بنجاح",
    title: "اختبار اتصال البريد ناجح",
    body: [
      "هذه رسالة تشغيلية تجريبية من منصة XMANSX.",
      "وصولها يعني أن نطاق الإرسال ومفتاح Resend وإعدادات الخادم تعمل بصورة صحيحة.",
    ],
  });
}

export function renderAppointmentBookedEmail(input: {
  customerName: string;
  salonName: string;
  barberName?: string | null;
  startAt: Date;
  portalUrl?: string | null;
}) {
  return renderCustomerEmail({
    preheader: `تم تأكيد موعدك لدى ${input.salonName}`,
    title: `تم تأكيد موعدك، ${input.customerName}`,
    body: [
      `الفرع: ${input.salonName}`,
      `الموعد: ${formatDateTime(input.startAt)}`,
      ...(input.barberName ? [`الحلاق: ${input.barberName}`] : []),
    ],
    cta: input.portalUrl ? { label: "عرض الموعد", url: input.portalUrl } : null,
  });
}

export function renderAppointmentCancelledEmail(input: {
  customerName: string;
  salonName: string;
  startAt: Date;
}) {
  return renderCustomerEmail({
    preheader: `تم إلغاء موعدك لدى ${input.salonName}`,
    title: "تم إلغاء الموعد",
    body: [
      `${input.customerName}، تم إلغاء موعدك لدى ${input.salonName}.`,
      `الموعد السابق: ${formatDateTime(input.startAt)}`,
    ],
  });
}

export function renderPlatformSupportReply(input: { customerName?: string | null; message: string }) {
  const greeting = input.customerName?.trim() ? `مرحبًا ${input.customerName.trim()}،` : "مرحبًا،";
  const paragraphs = input.message.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  return renderCustomerEmail({
    preheader: "لديك رد جديد من فريق دعم XMANSX",
    title: "رد فريق دعم XMANSX",
    body: [greeting, ...paragraphs],
    footer: "فريق دعم XMANSX · يمكنك الرد مباشرة على هذه الرسالة لمتابعة المحادثة",
  });
}

export function renderSubscriptionInvoiceEmail(input: {
  ownerName: string;
  organizationName: string;
  invoiceNumber: string;
  planName: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  invoiceUrl: string;
}) {
  return renderCustomerEmail({
    preheader: `تم تفعيل باقة ${input.planName} وإرفاق الفاتورة ${input.invoiceNumber}`,
    title: "تم تفعيل اشتراك مؤسستك",
    body: [
      `مرحبًا ${input.ownerName}، تم تفعيل اشتراك ${input.organizationName} بنجاح.`,
      `رقم الفاتورة: ${input.invoiceNumber}`,
      `الباقة: ${input.planName}`,
      `مبلغ الاشتراك: ${formatMoney(input.amount)}`,
      `تاريخ التفعيل: ${formatDate(input.periodStart)}`,
      `تاريخ الانتهاء: ${formatDate(input.periodEnd)}`,
      "ضريبة القيمة المضافة: غير مطبقة، وقيمتها صفر.",
      "أرفقنا نسخة PDF الرسمية، ويمكنك الرجوع إلى الفاتورة في صفحة الاشتراك في أي وقت.",
    ],
    cta: { label: "عرض الفاتورة", url: input.invoiceUrl },
    footer: "فريق فوترة إكس مانس إكس XMANSX · support@xmansx.com",
  });
}

function assertHttpsUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("رابط البريد غير صالح");
  }
  if (url.protocol !== "https:") throw new Error("رابط البريد يجب أن يستخدم HTTPS");
  return url.toString();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
