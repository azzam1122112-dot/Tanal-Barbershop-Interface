import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// يُقرأ `PUBLIC_APP_URL` وقت الطلب لا وقت البناء: نشرٌ نُسي فيه ضبط المتغيّر
// أثناء البناء كان سيُنتج ملفًا يشير إلى localhost ويُعطّل الفهرسة بصمت.
export const dynamic = "force-dynamic";

/**
 * كل ما خلف الصفحة التسويقية خاص: اللوحة والحلاق والمنصّة وواجهات الـ API.
 * `‎/my` و`‎/receipt` بالذات ممنوعة لأن الرمز في الرابط هو السرّ نفسه — فهرسة
 * واحدة منها تكشف سجل زيارات زبون حقيقي.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/join", "/signup", "/terms", "/privacy", "/refund-policy", "/digital-service-policy", "/data-processing-agreement", "/provider", "/contact"],
        disallow: ["/api/", "/dashboard", "/barber", "/platform", "/my/", "/receipt/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/"),
  };
}
