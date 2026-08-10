import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolveCustomerByPortalToken } from "@/lib/customers/customer-portal";
import { getEffectiveSettings } from "@/lib/settings/system-settings";
import { getRequestMeta } from "@/lib/auth/http";
import { consumeRateLimit } from "@/lib/auth/rate-limit";

/**
 * بيان تثبيت خاص بكل عميل.
 *
 * **لماذا ديناميكي**: `start_url` لازم يحمل رمز العميل نفسه، وإلا فتح التطبيق
 * المثبَّت صفحةً بلا هوية. بيان ثابت واحد لا يستطيع ذلك.
 *
 * **لماذا `pwa.webmanifest` لا `manifest.webmanifest`**: الاسم الأخير محجوز في
 * Next كاتفاقية مسار بيانات وصفية (metadata route)، فيُحقن في مساره جزء
 * `[__metadata_id__]` ويفشل الطلب بـ 500. الاسم هنا حر، والمتصفح يعتمد على
 * `rel="manifest"` ونوع المحتوى لا على اسم الملف.
 *
 * **لا يُضاف عامل خدمة للبوابة** التزامًا بقاعدة المشروع: بيانات العميل
 * (نقاط، مواعيد) لا تُخزَّن على الجهاز — قد يكون الجهاز مشتركًا، ورصيد قديم
 * معروض كأنه حالي خطأ لا تحسين.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const meta = await getRequestMeta();
  const limit = await consumeRateLimit(prisma, `portal-manifest:${meta.ipAddress ?? "unknown"}`, undefined, {
    windowMs: 5 * 60_000, maxAttempts: 60, lockMs: 5 * 60_000,
  });
  if (limit.limited) return NextResponse.json({ message: "طلبات كثيرة" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const { token } = await context.params;
  const customer = await resolveCustomerByPortalToken(prisma, token);
  if (!customer) {
    return NextResponse.json({ message: "الرابط غير صالح" }, { status: 404 });
  }

  const settings = await getEffectiveSettings(prisma, { organizationId: customer.organizationId });
  const brandName = settings?.legalName?.trim() || settings?.salonName || "بطاقتي";
  const scope = `/my/${token}`;

  return NextResponse.json(
    {
      name: `${brandName} — بطاقتي`,
      short_name: "بطاقتي",
      description: "نقاطك ومكافآتك ومواعيدك",
      start_url: scope,
      scope,
      display: "standalone",
      orientation: "portrait",
      dir: "rtl",
      lang: "ar",
      background_color: "#f4f2ed",
      theme_color: "#101916",
      icons: [
        { src: "/icons/xmansx-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/xmansx-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/xmansx-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
        // الرابط سرّي — لا يُخزَّن في وسيط مشترك ولا يُفهرس.
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
