import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "حلاق تنال | واجهة تنال للحلاقة الرجالية",
  description: "نظام تشغيل وولاء فاخر للحلاقة الرجالية وإدارة جلسات الصندوق والعملاء.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "حلاق تنال",
  },
  icons: {
    icon: [
      { url: "/icons/tanal-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/tanal-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#101916",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
