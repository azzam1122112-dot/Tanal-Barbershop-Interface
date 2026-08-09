import qrcode from "qrcode-generator";

/**
 * رمز QR للفاتورة الضريبية المبسّطة وفق متطلبات هيئة الزكاة والضريبة والجمارك.
 * الحقول الخمسة الإلزامية مرمّزة TLV ثم Base64:
 *   1) اسم البائع  2) الرقم الضريبي  3) التاريخ والوقت (ISO 8601)
 *   4) إجمالي الفاتورة شامل الضريبة  5) إجمالي الضريبة
 */
export type ZatcaInvoiceFields = {
  sellerName: string;
  vatNumber: string;
  timestamp: Date | string;
  totalWithVat: number;
  vatTotal: number;
};

export function buildZatcaTlvBase64(fields: ZatcaInvoiceFields): string {
  const values: string[] = [
    fields.sellerName.trim(),
    fields.vatNumber.trim(),
    new Date(fields.timestamp).toISOString(),
    formatAmount(fields.totalWithVat),
    formatAmount(fields.vatTotal),
  ];

  const chunks = values.map((value, index) => encodeTlv(index + 1, value));
  return Buffer.concat(chunks).toString("base64");
}

function encodeTlv(tag: number, value: string) {
  const valueBytes = Buffer.from(value, "utf8");
  if (valueBytes.length > 255) {
    // القيم الفعلية (اسم/رقم/تاريخ/مبلغ) أقصر من ذلك بكثير؛ نقصّ دفاعيًا لا أكثر.
    const trimmed = valueBytes.subarray(0, 255);
    return Buffer.concat([Buffer.from([tag, trimmed.length]), trimmed]);
  }
  return Buffer.concat([Buffer.from([tag, valueBytes.length]), valueBytes]);
}

/** الهيئة تتطلب المبالغ بمنزلتين عشريتين بلا فواصل آلاف ولا رمز عملة. */
function formatAmount(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * يولّد وسم SVG مضمّن للرمز — بلا طلبات شبكة ولا صور خارجية،
 * فيطبع بوضوح على الطابعات الحرارية ويعمل داخل PDF المتصفح.
 */
export function buildQrSvg(data: string, options: { cellSize?: number; margin?: number } = {}) {
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize: options.cellSize ?? 3, margin: options.margin ?? 0, scalable: true });
}

/** اختصار: يبني الرمز جاهزًا للعرض من حقول الفاتورة. */
export function buildZatcaQrSvg(fields: ZatcaInvoiceFields, options?: { cellSize?: number; margin?: number }) {
  return buildQrSvg(buildZatcaTlvBase64(fields), options);
}
