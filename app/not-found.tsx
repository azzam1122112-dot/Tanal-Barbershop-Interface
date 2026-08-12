import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { PRIVATE_ROBOTS } from "@/lib/seo";

/**
 * صفحة 404 تُعيد الحالة 404 فعلًا، لكن العنوان الافتراضي كان عنوان الموقع
 * نفسه. رابط مكسور يُشارَك في واتساب أو يُزحف من موقع خارجي كان يظهر بعنوان
 * الصفحة الرئيسية ووصفها — و`noindex` الصريح يمنع بقاء نسخة منها في الفهرس
 * بعنوان مضلّل إن تأخّر الزاحف عن قراءة الحالة.
 */
export const metadata: Metadata = {
  title: "الصفحة غير موجودة",
  description: "الرابط المطلوب غير موجود أو تم نقله.",
  robots: PRIVATE_ROBOTS,
};

export default function NotFoundPage() {
  return (
    <main className="barber-shell grid place-items-center">
      <section className="mx-auto w-full max-w-md">
        <div className="barber-card p-6 text-center">
          <BrandLogo className="mx-auto mb-4 h-20 w-20 shadow-md shadow-salon-ink/10" priority />
          <p className="text-sm font-bold text-salon-forest">الصفحة غير موجودة</p>
          <h1 className="mt-3 text-3xl font-bold text-salon-ink">لم نجد هذه الصفحة</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-salon-charcoal">
            يمكنك العودة للصفحة الرئيسية، أو لشاشة الحلاق ولوحة الإدارة ومتابعة العمل.
          </p>
          {/* الزائر القادم من نتيجة بحث أو رابط مكسور ليس موظفًا: كانت كل
              المخارج تؤدي إلى شاشات خلف تسجيل دخول فيصطدم بها ويغادر. */}
          <div className="mt-5 grid gap-2">
            <Link href="/" className="barber-gold-button min-h-12 py-3 text-center">
              الصفحة الرئيسية
            </Link>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href="/barber" className="barber-ghost-button min-h-12 py-3 text-center">
                شاشة الحلاق
              </Link>
              <Link href="/dashboard" className="barber-ghost-button min-h-12 py-3 text-center">
                الإدارة
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
