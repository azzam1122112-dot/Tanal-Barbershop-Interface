import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { PRIVATE_ROBOTS } from "@/lib/seo";

/**
 * نهاية الطريق لبطاقة العميل — صفحة استعادة لا صفحة «غير موجودة».
 *
 * **العطل:** رمز البوابة ينتهي بعد `PORTAL_TOKEN_TTL_DAYS` (٣٠ يومًا افتراضًا)،
 * وعندها يُرجع `getPortalIdentity` قيمة فارغة فيستدعي التخطيط `notFound()`.
 * فيهبط العميل — الذي حفظ رابط بطاقته وفتحه بعد شهر — على صفحة 404 العامة:
 * «لم نجد هذه الصفحة»، ومخارجُها **شاشة الحلاق ولوحة الإدارة**. أي أن صاحب
 * الرصيد يُقال له إن بطاقته غير موجودة، ثم يُدلّ على شاشتَي موظفين لا يملك
 * الدخول إليهما. لا ذكر لانتهاء الصلاحية ولا لطريقة الحصول على رابط جديد.
 *
 * **ولماذا لا نفرّق «منتهٍ» عن «خاطئ» هنا:** `not-found.tsx` لا يستقبل الرمز،
 * وتمريره إليه ليعيد فحصه يعني تسريب أن رمزًا بعينه كان موجودًا. الصياغة تغطّي
 * الحالتين بصدق، والمخارج تنفع في كلتيهما.
 */
export const metadata: Metadata = {
  title: "رابط البطاقة لم يعد صالحًا",
  description: "انتهت صلاحية رابط بطاقتك أو أنه غير صحيح.",
  robots: PRIVATE_ROBOTS,
};

export default function PortalNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-salon-mist px-4 py-10">
      <section className="w-full max-w-md">
        <div className="barber-card p-6 text-center">
          <BrandLogo className="mx-auto mb-4 h-16 w-16 shadow-md shadow-salon-ink/10" priority />
          <p className="text-sm font-bold text-salon-forest">بطاقة الولاء</p>
          <h1 className="mt-2 text-2xl font-bold leading-snug text-salon-ink">رابط بطاقتك لم يعد صالحًا</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-salon-charcoal">
            روابط البطاقة تنتهي صلاحيتها بعد مدة لحماية بياناتك.{" "}
            <strong className="text-salon-ink">نقاطك ورصيدك وزياراتك محفوظة كما هي</strong> — تحتاج فقط رابطًا جديدًا.
          </p>

          <div className="mt-6 grid gap-2.5 text-right">
            {/* الطريق الأول: من له حساب موحّد يفتح بطاقته بنفسه فورًا. */}
            <Link
              href="/account/loyalty"
              className="flex items-center justify-between gap-3 rounded-xl bg-salon-ink px-4 py-3.5 text-sm font-bold text-white transition hover:bg-salon-charcoal"
            >
              <span>افتح بطاقتك من حسابك</span>
              <span aria-hidden="true" className="shrink-0 font-black">
                ‹
              </span>
            </Link>

            {/* والثاني لمن سجّله الحلاق على الكرسي فلا حساب له: لا يُرسَل إلى
                شاشة دخول لا يملك بياناتها. */}
            <p className="rounded-xl border border-salon-line bg-salon-pearl px-4 py-3.5 text-xs font-semibold leading-6 text-salon-charcoal">
              ليس لديك حساب على المنصّة؟ اطلب رابطًا جديدًا من الصالون في زيارتك القادمة، أو امسح رمز الانضمام الموجود
              داخل المحل.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
