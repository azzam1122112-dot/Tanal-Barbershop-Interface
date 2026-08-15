import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

/**
 * كل مسار داخل `middleware.ts` يُصيَّر عند الطلب.
 *
 * السياسة هناك تحمل `nonce` جديدًا لكل طلب، وصفحةٌ مبنية وقت `next build` تحمل
 * سكربتات Next بلا توقيع فيحجبها المتصفح وتُشلّ الصفحة. التوجيه في **التخطيط**
 * لا في الصفحات: مكوّنات العميل لا تُحترم فيها إعدادات المقطع، وصفحةٌ جديدة
 * تُضاف لاحقًا ترث الحكم بلا أن يتذكّره أحد. ولا كلفة — هذه المسارات تُقدَّم
 * أصلًا بـ`Cache-Control: private, no-store`.
 *
 * يحرسه `tests/security-regressions.test.ts`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "حسابي",
  // صفحات حساب شخصية — لا مكان لها في نتائج البحث.
  robots: { index: false, follow: false },
};

/**
 * هيكل صفحات حساب العميل العالمي.
 *
 * منفصل عن `/my/[token]`: تلك بطاقة مؤسسة واحدة تُفتح برابط سرّي، وهذه هوية
 * الشخص عبر المنصّة تُفتح بجلسة. لا يشتركان في تخطيط ولا في مسار.
 *
 * **لا `justify-center` ولا `min-h-screen` على المحتوى.** التخطيط يخدم نوعين:
 * نماذج دخول قصيرة وصفحات محتوى تطول بعدد بطاقات العميل. التوسيط الرأسي يجعل
 * الأولى في منتصف الشاشة والثانية ملتصقة بأعلاها، فيقفز الشعار وترويسة الصفحة
 * بين مسار وآخر داخل نفس القسم. المحاذاة للأعلى واحدة للجميع.
 *
 * والعرض `max-w-lg` لا `max-w-md`: العمود الضيّق كان يترك ~85px لكل خانة في
 * شبكة بطاقة الولاء الرباعية. المسافة هنا والشبكة هناك حُلّتا معًا.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-salon-mist">
      <main className="mx-auto w-full max-w-lg px-4 pb-12 pt-8 sm:pt-12">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3" aria-label="الصفحة الرئيسية">
          <BrandLogo className="h-11 w-11 rounded-xl ring-1 ring-salon-line" priority />
          <span className="text-sm font-bold text-salon-charcoal/70">إكس مانس إكس XMANSX</span>
        </Link>
        {children}
      </main>
    </div>
  );
}
