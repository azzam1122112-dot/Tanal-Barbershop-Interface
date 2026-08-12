/**
 * ثوابت جلسة العميل — **بلا أي استيراد**، على نمط `lib/auth/config.ts`.
 *
 * `middleware` يعمل في Edge Runtime ويحتاج اسم الكوكي وحده. لو قرأه من
 * `account-session.ts` لَجرّ معه `node:crypto` إلى حزمة الحافة التي لا تدعمه.
 * ملف الثوابت يفصل ما تحتاجه الحافة عمّا يحتاجه الخادم.
 */

export const CUSTOMER_SESSION_COOKIE_NAME = "tanal_customer_session";

/** ثلاثون يومًا: العميل يفتح بطاقته مرة كل زيارة لا كل يوم. */
export const CUSTOMER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** `lastUsedAt` مؤشر صيانة لا يستحق كتابة في كل طلب. */
export const CUSTOMER_SESSION_LAST_USED_REFRESH_MS = 10 * 60 * 1000;
