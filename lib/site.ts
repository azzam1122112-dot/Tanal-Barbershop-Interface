/**
 * الأصل العام للموقع — مصدر واحد لكل رابط مطلق (canonical، صور OG، sitemap،
 * robots). بدونه تخرج صورة المشاركة بمسار نسبي فلا تظهر معاينة الرابط في
 * واتساب، وهي قناة التوزيع الأولى لهذا المنتج.
 *
 * يُضبط عبر `PUBLIC_APP_URL` (نفس المتغيّر الذي تعتمده روابط QR للولاء).
 */
const DEVELOPMENT_SITE_URL = "http://localhost:3000";
const PRODUCTION_SITE_URL = "https://xmansx.com";

export function resolveSiteUrl(configuredUrl = process.env.PUBLIC_APP_URL, nodeEnv = process.env.NODE_ENV) {
  const configured = configuredUrl?.trim().replace(/\/+$/, "");
  if (configured && !(nodeEnv === "production" && isLoopbackUrl(configured))) return configured;

  // لا نسمح لبناء إنتاج نُسي فيه المتغيّر، أو بقي مضبوطًا على عنوان التطوير،
  // أن ينشر روابط localhost في metadata.
  return nodeEnv === "production" ? PRODUCTION_SITE_URL : DEVELOPMENT_SITE_URL;
}

function isLoopbackUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export const siteUrl = resolveSiteUrl();

export function absoluteUrl(path = "/") {
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
