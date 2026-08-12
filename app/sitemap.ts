import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES } from "@/lib/seo-routes";
import { absoluteUrl } from "@/lib/site";

// نفس سبب `app/robots.ts`: العنوان يُقرأ وقت الطلب حتى لا تتجمّد خريطة الموقع
// على localhost إن بُني المشروع بلا `PUBLIC_APP_URL`.
export const dynamic = "force-dynamic";

/**
 * الصفحات العامة فقط، من الجرد المشترك في `lib/seo-routes.ts`.
 *
 * لا تُضِف هنا مسارًا يحمل رمزًا في الرابط (`‎/my/[token]`) — الرمز هو السرّ،
 * وإدراجه في خريطة الموقع يعني نشره.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: route.lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
