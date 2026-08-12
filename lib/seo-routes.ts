import { LEGAL_VERSION } from "@/lib/legal";

/**
 * جرد المسارات العامة والخاصة — مصدر واحد يقرأ منه `app/robots.ts`
 * و`app/sitemap.ts`.
 *
 * **لماذا مشترك:** الملفان كانا يحملان قائمتين مكتوبتين يدويًا. مسار يُضاف
 * لخريطة الموقع ويُنسى في `robots` (أو العكس) يُنتج أسوأ حالة ممكنة: خريطة
 * تُرشد الزاحف إلى صفحة مُنع من زحفها، فتظهر في Search Console كخطأ «مفهرسة
 * رغم الحظر» بدل أن تُفهرَس. القائمة الواحدة تجعل التناقض مستحيلًا، ويحرسه
 * `tests/seo.test.ts`.
 */

/**
 * تاريخ آخر تعديل جوهري للوثائق القانونية، مشتقّ من `LEGAL_VERSION`
 * (`YYYY-MM-DD.n`).
 *
 * **لا تستخدم `new Date()` هنا.** `lastmod` يتغيّر مع كل طلب يعني «كل صفحاتي
 * تتغيّر كل ثانية»، فيتوقف المحرّك عن الوثوق بالحقل ويتجاهله كليًا — وهو الحقل
 * الوحيد الذي يُسرّع إعادة زحف صفحة عُدِّلت فعلًا.
 */
export const LEGAL_LAST_MODIFIED = new Date(`${LEGAL_VERSION.split(".")[0]}T00:00:00.000Z`);

/** آخر تعديل على محتوى الصفحات التسويقية. حدِّثه عند تغيير جوهري في نصّها. */
export const MARKETING_LAST_MODIFIED = new Date("2026-08-12T00:00:00.000Z");

export type PublicRoute = {
  path: string;
  changeFrequency: "monthly" | "yearly";
  /** أهمية نسبية داخل الموقع نفسه فقط — لا تقارن بين المواقع. */
  priority: number;
  lastModified: Date;
};

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { path: "/", changeFrequency: "monthly", priority: 1, lastModified: MARKETING_LAST_MODIFIED },
  { path: "/signup", changeFrequency: "monthly", priority: 0.9, lastModified: MARKETING_LAST_MODIFIED },
  { path: "/contact", changeFrequency: "yearly", priority: 0.6, lastModified: MARKETING_LAST_MODIFIED },
  { path: "/provider", changeFrequency: "yearly", priority: 0.6, lastModified: LEGAL_LAST_MODIFIED },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.5, lastModified: LEGAL_LAST_MODIFIED },
  { path: "/terms", changeFrequency: "yearly", priority: 0.5, lastModified: LEGAL_LAST_MODIFIED },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.4, lastModified: LEGAL_LAST_MODIFIED },
  { path: "/digital-service-policy", changeFrequency: "yearly", priority: 0.4, lastModified: LEGAL_LAST_MODIFIED },
  { path: "/data-processing-agreement", changeFrequency: "yearly", priority: 0.4, lastModified: LEGAL_LAST_MODIFIED },
] as const;

/**
 * ما لا يُزحف إطلاقًا.
 *
 * `‎/join` عام لكنه ممنوع عمدًا: هو نموذج تسجيل بالجوال، وفهرسته تدعو الزاحف
 * والفضولي إلى تجربة أرقام. و`‎/api` مُدرج كمجلد لأن بعض الزواحف تعامل السطر
 * بلا شرطة نهائية كملف واحد.
 */
export const PRIVATE_ROUTE_PREFIXES: readonly string[] = [
  "/api/",
  "/dashboard",
  "/barber",
  "/platform",
  "/account",
  "/join",
  "/my/",
  "/receipt/",
] as const;
