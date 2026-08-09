import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "XMANSX | منصة إدارة الصالونات",
    template: "%s · XMANSX",
  },
  description: "منصة عربية متكاملة لإدارة وتشغيل صالونات الحلاقة الرجالية: الزيارات والصندوق والحجوزات والعملاء والولاء والفريق والمخزون والتقارير.",
  applicationName: "XMANSX",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "XMANSX",
  },
  icons: {
    icon: [
      { url: "/icons/xmansx-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/xmansx-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/xmansx-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // لا `maximumScale` ولا `userScalable: false` — منع التكبير يقطع الوصول عن
  // ضعاف البصر، وهذه شاشات فيها مبالغ وأرقام جوال تُقرأ ولا تُخمَّن.
  viewportFit: "cover",
  themeColor: "#09070f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={arabic.variable}>
      <body>{children}</body>
    </html>
  );
}
