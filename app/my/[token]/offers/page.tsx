import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { getPortalIdentity, getPortalOffers } from "@/lib/customers/portal-view";
import { formatDurationLabel } from "@/lib/appointments/duration-format";

export default async function PortalOffersPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const identity = await getPortalIdentity(token);
  if (!identity) notFound();

  const { menus, rewards, gifts } = await getPortalOffers(identity);
  const unlocked = rewards.filter((reward) => reward.unlocked);
  const locked = rewards.filter((reward) => !reward.unlocked);

  return (
    <div className="space-y-4">
      {gifts.length > 0 ? (
        <section className="lux-edge rounded-2xl border border-salon-gold/35 bg-salon-gold/[0.09] px-5 py-5 shadow-[var(--shadow-sm)]">
          <h2 className="lux-section-title">هدايا خاصة لك</h2>
          <p className="mt-1 text-xs font-semibold text-salon-charcoal">اذكرها للحلاق عند الدفع.</p>
          <ul className="mt-3.5 space-y-2">
            {gifts.map((gift) => (
              <li key={gift.id} className="rounded-xl bg-white/75 px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm font-bold [overflow-wrap:anywhere]">{gift.title}</span>
                  <span className="shrink-0 text-sm font-black text-salon-forest">
                    {formatMoney(gift.discountAmount)}
                  </span>
                </div>
                {gift.description ? (
                  <p className="mt-1 text-xs font-semibold text-salon-charcoal">{gift.description}</p>
                ) : null}
                {gift.expiresAt ? (
                  <p className="mt-1 text-xs font-bold text-salon-ruby">تنتهي {formatDate(gift.expiresAt)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {unlocked.length > 0 ? (
        <section className="barber-card px-5 py-5">
          <h2 className="lux-section-title">مكافآت جاهزة للاستبدال</h2>
          <p className="mt-1 text-xs font-semibold text-salon-charcoal">
            رصيدك {formatNumber(identity.points)} نقطة — اذكر المكافأة للحلاق عند الدفع.
          </p>
          <ul className="mt-3.5 space-y-2">
            {unlocked.map((reward) => (
              <li
                key={reward.id}
                className="flex items-baseline justify-between gap-3 rounded-xl bg-salon-forest/[0.07] px-3.5 py-2.5 text-sm font-bold"
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

      {locked.length > 0 ? (
        <section className="barber-card px-5 py-5">
          <h2 className="lux-section-title">مكافآت تجمع نقاطها</h2>
          <ul className="mt-3 space-y-2.5">
            {locked.map((reward) => (
              <li key={reward.id} className="rounded-xl bg-salon-mist px-3.5 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm font-bold [overflow-wrap:anywhere]">{reward.name}</span>
                  <span className="shrink-0 text-xs font-black text-salon-charcoal/70">
                    خصم {formatMoney(reward.discountAmount)}
                  </span>
                </div>
                <p className="mt-1 text-xs font-bold text-salon-charcoal/65">
                  تبقّى {formatNumber(reward.pointsRemaining)} نقطة
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rewards.length === 0 && gifts.length === 0 ? (
        <section className="barber-card px-5 py-5">
          <h2 className="lux-section-title">مكافآتك</h2>
          {/* لا تذكر «قواعد المكافآت» — إعداد داخلي للصالون لا يعني العميل شيئًا. */}
          <p className="mt-2 text-sm font-semibold leading-6 text-salon-charcoal">
            كل زيارة تضيف نقاطًا إلى رصيدك. اسأل الحلاق عن مكافآت الصالون في زيارتك القادمة.
          </p>
        </section>
      ) : null}

      {/* المنيو غير مقيَّد بتفعيل الحجز الذاتي: قائمة الأسعار معلومة يستحقها
          كل عميل حتى في فرع لا يستقبل حجزًا إلكترونيًا. */}
      {menus.map((salon) => (
        <section key={salon.id} className="barber-card overflow-hidden">
          <div className="barber-card-head flex items-baseline justify-between gap-3">
            <h2 className="font-bold text-salon-ink">
              {menus.length > 1 ? `خدمات ${salon.name}` : "خدمات الصالون"}
            </h2>
            <span className="shrink-0 text-[11px] font-bold text-salon-charcoal/55">
              {formatNumber(salon.services.length)} خدمة
            </span>
          </div>
          <ul className="divide-y divide-salon-line/70">
            {salon.services.map((service) => (
              <li key={service.id} className="flex items-baseline justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-bold [overflow-wrap:anywhere]">{service.name}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-salon-charcoal/60">
                    {formatDurationLabel(service.durationMinutes)}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-salon-forest lux-number">{formatMoney(service.price)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {menus.length > 0 ? (
        <Link
          href={`/my/${token}/appointments`}
          className="flex min-h-12 items-center justify-center rounded-2xl bg-salon-ink text-sm font-black text-white transition hover:bg-salon-ink/90"
        >
          احجز موعدك
        </Link>
      ) : null}

      <p className="pb-2 text-center text-xs font-semibold text-salon-charcoal/60">
        الأسعار إرشادية وقد تختلف حسب الخدمة المطلوبة.
      </p>
    </div>
  );
}
