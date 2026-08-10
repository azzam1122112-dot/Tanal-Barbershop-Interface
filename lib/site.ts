/**
 * الأصل العام للموقع — مصدر واحد لكل رابط مطلق (canonical، صور OG، sitemap،
 * robots). بدونه تخرج صورة المشاركة بمسار نسبي فلا تظهر معاينة الرابط في
 * واتساب، وهي قناة التوزيع الأولى لهذا المنتج.
 *
 * يُضبط عبر `PUBLIC_APP_URL` (نفس المتغيّر الذي تعتمده روابط QR للولاء).
 */
export const siteUrl = process.env.PUBLIC_APP_URL?.replace(/\/+$/, "") || "http://localhost:3000";

export function absoluteUrl(path = "/") {
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
