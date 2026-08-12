import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { legalInfo } from "@/lib/legal";
import {
  INDEXABLE_ROBOTS,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LANGUAGE,
  SITE_LOCALE,
  SITE_NAME,
  siteVerification,
} from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

/**
 * القيم الافتراضية التي ترثها كل صفحة.
 *
 * **لا `alternates` هنا عمدًا.** حقول Next تُورَّث، فرابط أساسي واحد في الجذر
 * يجعل كل صفحات الموقع تعلن أنها نسخة من الرئيسية فتسقط من الفهرس. الرابط
 * الأساسي مسؤولية كل صفحة عامة عبر `publicPageMetadata` في `lib/seo.ts`.
 *
 * بطاقة المشاركة الافتراضية هنا هي ما يجعل رابطًا لأي صفحة قانونية يصل بصورة
 * واسم موقع بدل مستطيل فارغ — و`app/opengraph-image.tsx` يغذّيها تلقائيًا.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${SITE_NAME} | منصة إدارة الصالونات`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [...SITE_KEYWORDS],
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  category: "business",
  authors: [{ name: legalInfo.providerName }],
  creator: legalInfo.providerName,
  publisher: SITE_NAME,
  robots: INDEXABLE_ROBOTS,
  verification: siteVerification,
  openGraph: {
    type: "website",
    locale: SITE_LOCALE,
    siteName: SITE_NAME,
    url: siteUrl,
    title: `${SITE_NAME} | منصة إدارة الصالونات`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | منصة إدارة الصالونات`,
    description: SITE_DESCRIPTION,
  },
  // الصفحات مليئة بأرقام جوال ومبالغ. متصفّح iOS يحوّلها إلى روابط اتصال
  // ويصبغها بلون مختلف فتظهر الأرقام المالية كأنها أزرار.
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE_NAME,
  },
  icons: {
    icon: [
      { url: "/icons/xmansx-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/xmansx-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/icons/xmansx-icon-192.png", sizes: "192x192", type: "image/png" }],
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
    <html lang={SITE_LANGUAGE} dir="rtl" className={arabic.variable}>
      <body>{children}</body>
    </html>
  );
}
