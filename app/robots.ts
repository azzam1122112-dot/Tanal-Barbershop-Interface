import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { PUBLIC_ROUTES, PRIVATE_ROUTE_PREFIXES } from "@/lib/seo-routes";

// يُقرأ `PUBLIC_APP_URL` وقت الطلب لا وقت البناء: نشرٌ نُسي فيه ضبط المتغيّر
// أثناء البناء كان سيُنتج ملفًا يشير إلى localhost ويُعطّل الفهرسة بصمت.
export const dynamic = "force-dynamic";

/**
 * كل ما خلف الصفحة التسويقية خاص: اللوحة والحلاق والمنصّة وحساب العميل وواجهات
 * الـ API. `‎/my` و`‎/receipt` بالذات ممنوعة لأن الرمز في الرابط هو السرّ نفسه —
 * فهرسة واحدة منها تكشف سجل زيارات زبون حقيقي.
 *
 * **قاعدة صريحة أفضل من قاعدة واحدة عامة:** بعض الزواحف (Bing وYandex بالذات)
 * تتجاهل قواعد `*` متى وجدت قاعدة باسمها، فتصبح الاستثناءات غير مطبَّقة عليها.
 * تكرار المجموعة نفسها للزواحف الرئيسية يجعل السلوك واحدًا لدى الجميع.
 */
export default function robots(): MetadataRoute.Robots {
  const group = {
    allow: [...PUBLIC_ROUTES.map((route) => route.path)],
    disallow: [...PRIVATE_ROUTE_PREFIXES],
  };

  return {
    rules: [
      { userAgent: "*", ...group },
      { userAgent: "Googlebot", ...group },
      { userAgent: "Googlebot-Image", ...group },
      { userAgent: "Bingbot", ...group },
      { userAgent: "Yandex", ...group },
      { userAgent: "DuckDuckBot", ...group },
      { userAgent: "Applebot", ...group },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    // Yandex وحده يقرأ `Host` — يحسم به أي نسخة من النطاق هي الأصل عندما تُقدَّم
    // الصفحة نفسها من نطاقات المستأجرين الفرعية.
    host: absoluteUrl("/"),
  };
}
