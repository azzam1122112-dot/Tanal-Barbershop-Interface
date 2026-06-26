export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** يحلّل قائمة الأصول المسموح بها من متغير بيئة مفصول بفواصل. */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin)
    .filter((value): value is string => value !== null);
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * دفاع CSRF بفحص ترويسة Origin على الطلبات المغيّرة للحالة.
 * المنطق: إذا وُجدت Origin يجب أن تطابق أصل الطلب أو قائمة مسموح بها.
 * غياب Origin يعني طلب خادم-لخادم (cron) لا متصفح، فلا يشكّل خطر CSRF.
 */
export function isTrustedOrigin(
  originHeader: string | null,
  requestOrigin: string,
  extraAllowed: string[] = [],
): boolean {
  if (!originHeader) return true;

  const origin = normalizeOrigin(originHeader);
  if (!origin) return false;

  const allowed = new Set<string>([normalizeOrigin(requestOrigin) ?? requestOrigin, ...extraAllowed]);
  return allowed.has(origin);
}
