import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `next dev` و`next build` يتشاركان مجلد `.next`، فتشغيل بناء بينما خادم التطوير
  // يعمل يُفسد المجلد على الاثنين (`Cannot find module for page: /_document`).
  // اضبط NEXT_DIST_DIR لبناء إلى مجلد منفصل دون إيقاف خادمك:
  //   NEXT_DIST_DIR=.next-build npm run build
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
