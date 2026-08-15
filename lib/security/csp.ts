/**
 * سياسة أمان المحتوى (CSP) — **مصدر حقيقة واحد** لـ`next.config.ts` و`middleware.ts`.
 *
 * ## لماذا نسختان لا واحدة
 *
 * `script-src 'unsafe-inline'` يُبطل مفعول CSP كدفاع ضد XSS: أي حقن HTML يصير
 * تنفيذ سكربت. البديل `nonce` — رقم عشوائي لكل طلب يحمله كل سكربت مشروع — لكنه
 * **لا يعمل مع صفحة مُصيَّرة مسبقًا**: HTML المبني وقت `next build` يحمل سكربتات
 * Next الداخلية بلا nonce (لا وجود لطلب بعد)، فترويسة تطلب nonce تحجبها كلها
 * وتُعطب الصفحة.
 *
 * لذلك:
 * - **الصفحات العامة المُصيَّرة مسبقًا** (التسويق والوثائق القانونية) تأخذ النسخة
 *   الثابتة بـ`'unsafe-inline'` من `next.config.ts`. محتواها كله ثوابت مكتوبة في
 *   الكود بلا أي بيانات من قاعدة البيانات، فسطح XSS فيها معدوم عمليًا.
 * - **كل ما يعرض بيانات** (اللوحة، الحلاق، المنصّة، الإيصال، بوابة العميل،
 *   الانضمام) يأخذ نسخة الـnonce من `middleware.ts`. هناك يعيش المال وبيانات
 *   العملاء، وهناك يجب أن يكون الدفاع.
 *
 * ## الشرط الذي يجب ألا ينكسر
 *
 * **كل صفحة داخل مسارات `middleware.ts` يجب أن تُصيَّر عند الطلب.** خمس صفحات
 * دخول كانت مُصيَّرة مسبقًا (`/dashboard/login` وأخواتها) فأُلزمت
 * بـ`force-dynamic`. لم يكلّف ذلك شيئًا: `next.config.ts` يضع عليها أصلًا
 * `Cache-Control: private, no-store`، أي أن تصييرها المسبق لم يكن يُخزَّن في أي
 * طبقة. يحرس هذا `tests/security-regressions.test.ts`.
 */

export const CSP_NONCE_HEADER = "x-nonce";

/**
 * `strict-dynamic` يُهمل `'self'` للسكربتات ويثق بما يحمّله سكربتٌ موقّع بـnonce
 * — وهو ما تفعله حزمة Next بالضبط. والمتصفح الذي لا يعرفه يعود إلى `'self'`.
 *
 * و`worker-src 'self'` مُعلن صراحةً: بدونه يرث عامل الخدمة قيود `script-src`
 * بما فيها `strict-dynamic`، فيُحجب تسجيل `/barber-sw.js` ويسقط تطبيق الحلاق
 * المثبَّت — أهم ما في الواجهة — بلا رسالة مفهومة.
 */
export function buildContentSecurityPolicy(options: { nonce?: string | null; isProduction: boolean }) {
  const scriptSrc = options.nonce
    ? `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'`
    : "script-src 'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    scriptSrc,
    // الأنماط تبقى `'unsafe-inline'`: Tailwind والأنماط السطرية في React لا
    // تحمل nonce، وحقن CSS وحده لا ينفّذ كودًا.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    ...(options.isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** رقم عشوائي لكل طلب. `randomUUID` متاح في Edge Runtime بلا استيراد `node:crypto`. */
export function createCspNonce() {
  return btoa(crypto.randomUUID());
}
