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

  return (
    <main className="min-h-screen overflow-x-hidden bg-salon-mist px-4 py-8">
      <div className="mx-auto min-w-0 max-w-3xl space-y-4">
        <header className="lux-edge rounded-2xl border border-white/10 bg-sidebar-onyx px-6 py-7 text-center text-white shadow-[var(--shadow-lg)]">
          <p className="text-xs font-bold uppercase tracking-eyebrow text-salon-goldlight">{view.brandName}</p>
          <h1 className="mt-3 break-words text-2xl font-bold [overflow-wrap:anywhere]">أهلًا {view.customer.name}</h1>
          <p className="mt-6 text-6xl font-black tabular-nums text-salon-goldlight">{formatNumber(view.points)}</p>
          <p className="mt-1 text-sm font-bold text-white/70">نقطة في رصيدك</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-white/[0.08] px-3 py-3">
              <p className="text-xs font-semibold text-white/60">عدد زياراتك</p>
              <p className="mt-1 text-xl font-black tabular-nums">{formatNumber(view.visitCount)}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.08] px-3 py-3">
              <p className="text-xs font-semibold text-white/60">آخر زيارة</p>
              <p className="mt-1 text-sm font-bold">{view.lastVisitAt ? formatDate(view.lastVisitAt) : "-"}</p>
            </div>
          </div>
        </header>

        {view.nextReward ? (
          <section className="barber-card px-5 py-5">
            <h2 className="text-base font-bold">مكافأتك القادمة</h2>
            <p className="mt-1.5 text-sm font-semibold text-salon-charcoal">
              {view.nextReward.name} — خصم {formatMoney(view.nextReward.discountAmount)}
            </p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-salon-mist">
              <div
                className="h-full rounded-full bg-gradient-to-l from-salon-gold to-salon-forest transition-[width]"
                style={{ width: `${view.nextReward.progress}%` }}
              />
            </div>
            <p className="mt-2 text-sm font-bold text-salon-forest">
              باقٍ {formatNumber(view.nextReward.pointsRemaining)} نقطة فقط
            </p>
          </section>
        ) : view.unlockedRewards.length === 0 && view.managerRewards.length === 0 ? (
          <section className="barber-card px-5 py-5">
            <h2 className="text-base font-bold">مكافآتك</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-salon-charcoal">
              ستظهر مكافآتك هنا فور إضافة قواعد المكافآت وبدء جمع النقاط.
            </p>
          </section>
        ) : null}

        {view.unlockedRewards.length > 0 ? (
          <section className="rounded-2xl border border-salon-gold/35 bg-salon-gold/[0.09] px-5 py-5 shadow-[var(--shadow-sm)]">
            <h2 className="text-base font-bold">مكافآت جاهزة للاستبدال</h2>
            <ul className="mt-3 space-y-2">
              {view.unlockedRewards.map((reward) => (
                <li key={reward.id} className="flex items-baseline justify-between gap-3 text-sm font-bold">
                  <span>{reward.name}</span>
                  <span className="tabular-nums text-salon-forest">خصم {formatMoney(reward.discountAmount)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs font-semibold text-salon-charcoal">اذكرها للحلاق عند زيارتك القادمة.</p>
          </section>
        ) : null}

        {view.managerRewards.length > 0 ? (
          <section className="barber-card px-5 py-5">
            <h2 className="text-base font-bold">هدايا خاصة لك</h2>
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
          <h2 className="text-base font-bold">آخر زياراتك</h2>
          {view.recentVisits.length === 0 ? (
            <p className="mt-3 text-sm font-semibold text-salon-charcoal">لا توجد زيارات مسجّلة بعد.</p>
          ) : (
            <ul className="mt-3 divide-y divide-salon-line/70">
              {view.recentVisits.map((visit) => (
                <li key={visit.id} className="py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold">{formatDate(visit.visitedAt)}</span>
                    <span className="text-sm font-black tabular-nums">{formatMoney(visit.netAmount)}</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-salon-charcoal">
                    {visit.services.join("، ") || "زيارة"}
                    {visit.pointsEarned > 0 ? ` · +${formatNumber(visit.pointsEarned)} نقطة` : ""}
                  </p>
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
