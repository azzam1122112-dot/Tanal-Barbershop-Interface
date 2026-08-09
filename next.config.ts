import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
