import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./lib/security/csp";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // PDFKit يعتمد وقت التشغيل على وحدات وبيانات يحمّلها ديناميكيًا. إبقاؤه
  // حزمة خادم خارجية يمنع Webpack من إسقاط تلك الملفات في نشر الإنتاج.
  serverExternalPackages: ["pdfkit"],
  // مولّد الإيصال يقرأ الخطين من القرص وقت التشغيل. تضمينهما صراحةً يحافظ
  // عليهما أيضًا عند نشر ناتج file tracing أو حزمة standalone مصغّرة.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@ibm/plex-sans-arabic/fonts/complete/woff/IBMPlexSansArabic-Regular.woff",
      "./node_modules/@ibm/plex-sans-arabic/fonts/complete/woff/IBMPlexSansArabic-Bold.woff",
      "./public/icons/xmansx-icon-192.png",
    ],
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      {
        // الأساس للصفحات العامة المُصيَّرة مسبقًا. المسارات التي تعرض بيانات
        // يستبدلها `middleware.ts` بنسخة nonce بلا `'unsafe-inline'`.
        key: "Content-Security-Policy",
        value: buildContentSecurityPolicy({ isProduction: process.env.NODE_ENV === "production" }),
      },
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
    ];

    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }],
      },
      ...["/dashboard/:path*", "/barber/:path*", "/platform/:path*", "/receipt/:path*", "/my/:path*"].map(
        (source) => ({
          source,
          headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }],
        }),
      ),
    ];
  },
  // يفيد بيئات CI محدودة الذاكرة، ولا يغيّر عدد عمّال البناء إلا عند ضبط المتغيّر.
  experimental: process.env.NEXT_BUILD_CPUS
    ? { cpus: Math.max(1, Number(process.env.NEXT_BUILD_CPUS) || 1) }
    : undefined,
  // `next dev` و`next build` يتشاركان مجلد `.next`، فتشغيل بناء بينما خادم التطوير
  // يعمل يُفسد المجلد على الاثنين (`Cannot find module for page: /_document`).
  // اضبط NEXT_DIST_DIR لبناء إلى مجلد منفصل دون إيقاف خادمك:
  //   NEXT_DIST_DIR=.next-build npm run build
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
