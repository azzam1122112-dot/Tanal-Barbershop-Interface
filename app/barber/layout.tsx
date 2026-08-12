import type { Metadata, Viewport } from "next";
import { BarberPwa } from "@/components/barber/pwa";

/**
 * واجهة الحلاق تُثبَّت كتطبيق مستقل: بيان (manifest) خاص بها بنطاق `/barber`
 * حتى يفتح التطبيق على شاشة العمل مباشرة لا على صفحة التسويق.
 */
export const metadata: Metadata = {
  title: {
    default: "إكس مانس إكس XMANSX — واجهة الحلاق",
    template: "%s · إكس مانس إكس XMANSX",
  },
  description: "تسجيل الزيارات، البحث عن العملاء، وجلسة الصندوق — من جوالك مباشرة.",
  manifest: "/barber.webmanifest",
  applicationName: "إكس مانس إكس XMANSX حلاق",
  appleWebApp: {
    capable: true,
    // `default` لا `black-translucent`: الأخير يمدّ المحتوى تحت شريط الحالة،
    // وواجهة الحلاق شاشة عمل بأرقام لا لوحة عرض.
    statusBarStyle: "default",
    title: "إكس مانس إكس XMANSX حلاق",
  },
  // شاشة تشغيل داخلية لا يفيد فهرستها.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#101916",
};

export default function BarberLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BarberPwa />
    </>
  );
}
