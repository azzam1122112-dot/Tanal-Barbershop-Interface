import { notFound } from "next/navigation";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { getPortalIdentity, getPortalVisits } from "@/lib/customers/portal-view";

export default async function PortalVisitsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const identity = await getPortalIdentity(token);
  if (!identity) notFound();

  const { recentVisits } = await getPortalVisits(identity);

  return (
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
  );
}
