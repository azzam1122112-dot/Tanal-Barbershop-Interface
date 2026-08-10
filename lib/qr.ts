import qrcode from "qrcode-generator";

/** QR عام لروابط داخلية مثل ملصق الولاء. لا يحمل أي دلالة ضريبية. */
export function buildQrSvg(data: string, options: { cellSize?: number; margin?: number } = {}) {
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize: options.cellSize ?? 3, margin: options.margin ?? 0, scalable: true });
}
