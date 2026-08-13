import type { Metadata, Viewport } from "next";
import { BarberPwa } from "@/components/barber/pwa";
import { NoticeRelay } from "@/components/ui/notice-relay";

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

/**
 * التقاط `beforeinstallprompt` **قبل ترطيب React**.
 *
 * المتصفح يُطلق الحدث مرة واحدة أثناء تحميل الصفحة متى تحققت شروط التثبيت،
 * **ولا يعيد إطلاقه**. وكان المستمع الوحيد داخل `useEffect` في `BarberPwa` —
 * أي بعد الترطيب بمئات الأجزاء من الثانية على جوال متوسط عبر شبكة الجوال. فيقع
 * الحدث في الفراغ وتبقى دعوة التثبيت مخفية للأبد على ذلك التحميل: الحلاق لا يرى
 * الدعوة أبدًا مهما فتح الشاشة.
 *
 * السكربت المضمّن ينفَّذ أثناء تحليل HTML — قبل أي كود React — فيمسك الحدث
 * ويحتفظ به على `window`، ثم يبثّ حدثًا خاصًا لمن يستيقظ بعده. CSP يسمح بـ
 * `'unsafe-inline'` للسكربتات (انظر `next.config.ts`).
 */
const CAPTURE_INSTALL_PROMPT = `(function(){
if(window.__xInstallReady)return;window.__xInstallReady=1;
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__xInstallPrompt=e;window.dispatchEvent(new Event('x:installprompt'));});
window.addEventListener('appinstalled',function(){window.__xInstallPrompt=null;});
})();`;

export default function BarberLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALL_PROMPT }} />
      {children}
      <BarberPwa />
      {/* تأكيدات ما بعد إعادة التحميل — فتح جلسة الصندوق وإنهاؤها خصوصًا. */}
      <NoticeRelay />
    </>
  );
}
