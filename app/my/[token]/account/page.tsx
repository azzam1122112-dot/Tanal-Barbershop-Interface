import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPortalAccount, getPortalIdentity } from "@/lib/customers/portal-view";
import { PortalInstall } from "@/components/public/portal-install";
import { CustomerPrivacyRequest } from "@/components/public/customer-privacy-request";

export const metadata: Metadata = { title: "حسابي" };

/**
 * تبويب «حسابي».
 *
 * **ما لا يُفعل في كل زيارة لا يقف في الشاشة الأولى.** كانت دعوة التثبيت
 * (مهمة مرة واحدة في عمر الجهاز) ونموذجُ طلبات الخصوصية (أربعة حقول يفتحها
 * العميل مرة في العمر إن فتحها) يقفان تحت رصيد النقاط مباشرة، فتُقرأ بطاقةُ
 * الولاء كاستمارة رسمية. هنا مكانهما، وبنقرة واحدة.
 */
export default async function PortalAccountPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const identity = await getPortalIdentity(token);
  if (!identity) notFound();

  const { dataSubjectRequests } = await getPortalAccount(identity);

  return (
    <div className="space-y-4">
      <section className="barber-card px-5 py-5">
        <h2 className="lux-section-title">بياناتك لدى {identity.brandName}</h2>
        <dl className="mt-4 space-y-3">
          <Row label="الاسم" value={identity.customer.name} />
          <Row label="رقم الجوال" value={identity.customer.phone} ltr />
        </dl>
        <p className="mt-4 text-xs font-semibold leading-6 text-salon-charcoal/65">
          لتعديل اسمك أو رقمك أخبر الحلاق في زيارتك القادمة، أو أرسل طلب «تصحيح بياناتي» من الأسفل.
        </p>
      </section>

      <PortalInstall />

      {/* رابط الهوية الموحّدة لمن له حساب فقط: من سجّله الحلاق على الكرسي لا
          حساب له، وإرساله إلى شاشة دخول لا يملك بياناتها طريق مسدود. */}
      {identity.hasUnifiedAccount ? (
        <Link
          href="/account/loyalty"
          className="flex items-center justify-between gap-3 rounded-2xl border border-salon-line bg-white px-5 py-4 shadow-[var(--shadow-sm)] transition hover:border-salon-forest/40"
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold text-salon-ink">صالوناتك الأخرى</span>
            <span className="mt-0.5 block text-xs font-semibold text-salon-charcoal/70">
              كل بطاقات الولاء المرتبطة بحسابك على المنصّة
            </span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-lg font-black text-salon-forest">
            ‹
          </span>
        </Link>
      ) : null}

      <CustomerPrivacyRequest token={token} initialRequests={dataSubjectRequests} />

      <p className="pb-2 text-center text-xs font-semibold leading-6 text-salon-charcoal/70">
        هذا الرابط هو مفتاح بطاقتك — لا تشاركه مع أحد.
      </p>
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-salon-line/70 pb-3 last:border-0 last:pb-0">
      <dt className="text-sm font-semibold text-salon-charcoal/65">{label}</dt>
      <dd className="text-sm font-bold text-salon-ink" dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}
