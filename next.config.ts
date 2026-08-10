import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
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
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "frame-ancestors 'none'",
          "form-action 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "manifest-src 'self'",
          ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
        ].join("; "),
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
