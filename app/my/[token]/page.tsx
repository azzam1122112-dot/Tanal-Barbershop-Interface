import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/db/prisma";
import { getCustomerPortalView } from "@/lib/customers/customer-portal";
import { PortalBooking } from "@/components/public/portal-booking";
import { PortalInstall } from "@/components/public/portal-install";
import { CustomerPrivacyRequest } from "@/components/public/customer-privacy-request";

/**
 * البيان يُحقن عبر `metadata` لا كوسم `<link>` في الجسم: الوسم اليدوي **يُضاف**
 * إلى بيان الجذر فيصير في الصفحة بيانان، والمتصفح يأخذ الأول — فيُثبَّت الموقع
 * كاملًا بدل بطاقة العميل. `metadata.manifest` يستبدل بيان الجذر لهذا المسار،
 * وهو نفس ما تفعله واجهة الحلاق.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "بطاقتي",
    // الرابط سرّي — لا نريده في نتائج البحث.
    robots: { index: false, follow: false },
    manifest: `/my/${token}/pwa.webmanifest`,
  };
}

export default async function CustomerPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getCustomerPortalView(prisma, token);
  if (!view) notFound();

  // اسم القاعدة كثيرًا ما يكون «خصم ٢٥ ريال»، فإلحاق المبلغ به ينتج تكرارًا
  // مثل «خصم ٢٥ ريال — خصم ٢٥ ريال». نعرض المبلغ فقط حين لا يذكره الاسم.
  const nextRewardMentionsAmount = view.nextReward
    ? view.nextReward.name.includes(String(view.nextReward.discountAmount))
    : false;

  return (
    <main className="min-h-screen overflow-x-hidden bg-salon-mist px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto min-w-0 max-w-3xl space-y-4">
        <header className="lux-edge rounded-2xl border border-white/10 bg-sidebar-onyx px-6 py-8 text-center text-white shadow-[var(--shadow-lg)]">
          <p className="lux-eyebrow text-salon-goldlight">{view.brandName}</p>
          <h1 className="mt-3 text-2xl font-bold [overflow-wrap:anywhere]">أهلًا {view.customer.name}</h1>

          <p className="mt-7 text-6xl leading-none text-salon-goldlight lux-number">{formatNumber(view.points)}</p>
          <p className="mt-2 text-sm font-bold text-white/70">نقطة في رصيدك</p>
          {/* الرقم وحده بلا معنى؛ هذا السطر يخبر العميل كيف يكبر رصيده. */}
          <p className="mt-1 text-xs font-semibold text-white/45">
            تكسب {view.pointsPerRiyal === 1 ? "نقطة" : `${formatNumber(view.pointsPerRiyal)} نقاط`} على كل ريال
          </p>

          <div className="mt-7 grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-xl bg-white/[0.08] px-2 py-3">
              <p className="text-[11px] font-semibold text-white/55">زياراتك</p>
              <p className="mt-1 text-lg lux-number">{formatNumber(view.visitCount)}</p>
            </div>
            <div className="rounded-xl bg-white/[0.08] px-2 py-3">
              <p className="text-[11px] font-semibold text-white/55">مجموع نقاطك</p>
              <p className="mt-1 text-lg lux-number">{formatNumber(view.lifetimeEarned)}</p>
            </div>
            <div className="rounded-xl bg-white/[0.08] px-2 py-3">
              <p className="text-[11px] font-semibold text-white/55">آخر زيارة</p>
              <p className="mt-1 text-sm font-bold">{view.lastVisitAt ? formatDate(view.lastVisitAt) : "—"}</p>
            </div>
          </div>
        </header>

        {view.nextReward ? (
          <section className="barber-card px-5 py-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="lux-section-title">مكافأتك القادمة</h2>
              <span className="text-sm text-salon-forest lux-number">{view.nextReward.progress}%</span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-salon-charcoal">
              {view.nextReward.name}
              {nextRewardMentionsAmount ? "" : ` — خصم ${formatMoney(view.nextReward.discountAmount)}`}
            </p>
            <div
              className="mt-4 h-3 overflow-hidden rounded-full bg-salon-mist"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={view.nextReward.progress}
              aria-label="تقدّمك نحو المكافأة القادمة"
            >
              <div
                className="h-full rounded-full bg-gradient-to-l from-salon-gold to-salon-forest transition-[width]"
                style={{ width: `${view.nextReward.progress}%` }}
              />
            </div>
            {/* «فقط» تُقال حين يكون الباقي قريبًا؛ مع ٣٥٥ نقطة متبقية تبدو سخرية. */}
            <p className="mt-2.5 text-sm font-bold text-salon-forest">
              تبقّى {formatNumber(view.nextReward.pointsRemaining)} نقطة للوصول إليها
            </p>
          </section>
        ) : view.unlockedRewards.length === 0 && view.managerRewards.length === 0 ? (
          <section className="barber-card px-5 py-5">
            <h2 className="lux-section-title">مكافآتك</h2>
            {/* لا تذكر «قواعد المكافآت» — إعداد داخلي للصالون لا يعني العميل شيئًا. */}
            <p className="mt-2 text-sm font-semibold leading-6 text-salon-charcoal">
              كل زيارة تضيف نقاطًا إلى رصيدك. اسأل الحلاق عن مكافآت الصالون في زيارتك القادمة.
            </p>
          </section>
        ) : null}

        {view.unlockedRewards.length > 0 ? (
          <section className="lux-edge rounded-2xl border border-salon-gold/35 bg-salon-gold/[0.09] px-5 py-5 shadow-[var(--shadow-sm)]">
            <h2 className="lux-section-title">مكافآت جاهزة للاستبدال</h2>
            <p className="mt-1 text-xs font-semibold text-salon-charcoal">
              اذكرها للحلاق عند الدفع ليُطبّق الخصم.
            </p>
            <ul className="mt-3.5 space-y-2">
              {view.unlockedRewards.map((reward) => (
                <li
                  key={reward.id}
                  className="flex items-baseline justify-between gap-3 rounded-xl bg-white/70 px-3.5 py-2.5 text-sm font-bold"
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">{reward.name}</span>
                  <span className="shrink-0 text-salon-forest lux-number">
                    خصم {formatMoney(reward.discountAmount)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {view.managerRewards.length > 0 ? (
          <section className="barber-card px-5 py-5">
            <h2 className="lux-section-title">هدايا خاصة لك</h2>
            <ul className="mt-3 space-y-3">
              {view.managerRewards.map((reward) => (
                <li key={reward.id} className="rounded-2xl bg-salon-pearl px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold">{reward.title}</span>
                    <span className="text-sm font-bold tabular-nums text-salon-forest">
                      {formatMoney(reward.discountAmount)}
                    </span>
                  </div>
                  {reward.description ? (
                    <p className="mt-1 text-xs font-semibold text-salon-charcoal">{reward.description}</p>
                  ) : null}
                  {reward.expiresAt ? (
                    <p className="mt-1 text-xs font-bold text-salon-ruby">تنتهي {formatDate(reward.expiresAt)}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* يبقى قسم الحجوزات ظاهرًا دائمًا كي يعرف العميل حالة الخدمة بدل أن تختفي بصمت. */}
        <PortalBooking
          token={token}
          salons={view.bookableSalons}
          initialAppointments={view.appointments}
          bookingPolicy={view.bookingPolicy}
        />

        <section className="barber-card px-5 py-5">
          <h2 className="lux-section-title">آخر زياراتك</h2>
          {view.recentVisits.length === 0 ? (
            <p className="mt-3 text-sm font-semibold text-salon-charcoal">لا توجد زيارات مسجّلة بعد.</p>
          ) : (
            <ul className="mt-3 divide-y divide-salon-line/70">
              {view.recentVisits.map((visit) => (
                <li key={visit.id} className="py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold">{formatDate(visit.visitedAt)}</span>
                    <span className="text-sm lux-number">{formatMoney(visit.netAmount)}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-salon-charcoal [overflow-wrap:anywhere]">
                    {visit.services.join("، ") || "زيارة"}
                    {/* الفرع كان يُجلب ولا يُعرض — يهم العميل في صالون متعدد الفروع. */}
                    {visit.salonName ? ` · ${visit.salonName}` : ""}
                  </p>
                  {visit.pointsEarned > 0 ? (
                    <p className="mt-1.5 inline-flex rounded-full bg-salon-mist px-2.5 py-1 text-[11px] font-bold text-salon-forest">
                      +{formatNumber(visit.pointsEarned)} نقطة
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <PortalInstall />

        <CustomerPrivacyRequest token={token} initialRequests={view.dataSubjectRequests} />

        <p className="pb-4 text-center text-xs font-semibold text-salon-charcoal/70">
          هذا الرابط خاص بك — لا تشاركه مع أحد.
        </p>
      </div>
    </main>
  );
}
