export const SESSION_COOKIE_NAME = "tanal_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

/**
 * أقل فاصل بين تحديثين لـ `lastUsedAt`. الحقل مؤشر نشاط لصيانة الجلسات لا أكثر،
 * فتحديثه في كل طلب يعني كتابة في قاعدة البيانات مع كل صفحة ونداء API.
 */
export const SESSION_LAST_USED_REFRESH_MS = 10 * 60 * 1000;

export function getSessionExpiresAt(now = new Date()) {
  return new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
}
