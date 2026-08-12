import { notFound } from "next/navigation";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { getPortalIdentity, getPortalVisits } from "@/lib/customers/portal-view";
import { LOYALTY_MOVEMENT_LABEL } from "@/lib/customers/loyalty-wallet";

export default async function PortalVisitsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const identity = await getPortalIdentity(token);
  if (!identity) notFound();

  const { recentVisits, pointsMovements } = await getPortalVisits(identity);

  return (
    <div className="space-y-4">
      <section className="barber-card px-5 py-5">
        <h2 className="lux-section-title">آخر زياراتك</h2>
        {recentVisits.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-salon-charcoal">
            لا توجد زيارات مسجّلة بعد. أول زيارة تبدأ رصيد نقاطك.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-salon-line/70">
            {recentVisits.map((visit) => (
              <li key={visit.id} className="py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold">{formatDate(visit.visitedAt)}</span>
                  <span className="text-sm lux-number">{formatMoney(visit.netAmount)}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-salon-charcoal [overflow-wrap:anywhere]">
                  {visit.services.join("، ") || "زيارة"}
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

      {/* سجل النقاط لا قائمة الزيارات وحدها: الزيارة تُظهر المكتسب فقط، أما
          الاستبدال والتسوية والعكس والانتهاء فلا أثر لها — فيبقى الرصيد رقمًا
          لا يستطيع صاحبه مراجعته. `balanceAfter` مخزَّن لكل حركة، فالسطر يقول
          «صار رصيدك كذا» لا الفرق وحده. */}
      {pointsMovements.length > 0 ? (
        <section className="barber-card px-5 py-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="lux-section-title">حركة نقاطك</h2>
            <span className="shrink-0 text-sm text-salon-forest lux-number">
              {formatNumber(identity.points)} نقطة
            </span>
          </div>
          <ul className="mt-3 divide-y divide-salon-line/70">
            {pointsMovements.map((movement) => (
              <li key={movement.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-salon-ink">{LOYALTY_MOVEMENT_LABEL[movement.type]}</p>
                  <p className="mt-0.5 text-xs font-semibold text-salon-charcoal/60">
                    {formatDate(movement.createdAt)} · صار رصيدك {formatNumber(movement.balanceAfter)}
                  </p>
                </div>
                <span
                  dir="ltr"
                  className={`lux-number shrink-0 text-sm ${
                    movement.points >= 0 ? "text-salon-forest" : "text-salon-ruby"
                  }`}
                >
                  {movement.points >= 0 ? "+" : "−"}
                  {formatNumber(Math.abs(movement.points))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
