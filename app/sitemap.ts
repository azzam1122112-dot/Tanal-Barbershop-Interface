import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// نفس سبب `app/robots.ts`: العنوان يُقرأ وقت الطلب حتى لا تتجمّد خريطة الموقع
// على localhost إن بُني المشروع بلا `PUBLIC_APP_URL`.
export const dynamic = "force-dynamic";

/**
 * الصفحات العامة فقط. لا تُضِف هنا مسارًا يحمل رمزًا في الرابط (`‎/my/[token]`)
 * — الرمز هو السرّ، وإدراجه في خريطة الموقع يعني نشره.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "monthly", priority: 1 },
    { url: absoluteUrl("/signup"), changeFrequency: "yearly", priority: 0.8 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.5 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.6 },
    { url: absoluteUrl("/refund-policy"), changeFrequency: "yearly", priority: 0.5 },
    { url: absoluteUrl("/digital-service-policy"), changeFrequency: "yearly", priority: 0.5 },
    { url: absoluteUrl("/data-processing-agreement"), changeFrequency: "yearly", priority: 0.5 },
    { url: absoluteUrl("/provider"), changeFrequency: "yearly", priority: 0.6 },
    { url: absoluteUrl("/contact"), changeFrequency: "yearly", priority: 0.6 },
  ];
}
