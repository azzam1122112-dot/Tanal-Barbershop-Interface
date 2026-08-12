import Link from "next/link";
import { Badge } from "@/components/dashboard/ui";
import type { WalletActivityEntry, WalletBranch, WalletCard } from "@/lib/customers/loyalty-wallet";
import { LOYALTY_MOVEMENT_LABEL } from "@/lib/customers/loyalty-wallet";
import { formatNumber, formatRelativeDay } from "@/lib/format";

/**
 * بطاقة مؤسسة في المحفظة.
 *
 * السطح `.barber-card` لا صياغة يدوية: التدرّج والظل والحدّ وإضاءة الحافة تأتي
 * من مكان واحد، فلا تختلف بطاقة المحفظة عن لوح البوابة على الجهاز نفسه.
 */
export function LoyaltyCard({ card }: { card: WalletCard }) {
  return (
    <Link
      href={`/account/loyalty/${encodeURIComponent(card.reference)}`}
      className="barber-card lux-hover block p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-base font-bold leading-7 text-salon-ink">{card.organizationName}</h2>
        {/* `Badge` المشترك بنقطته اللونية — الشارة المحلية كانت نسخة من نبرة
            `warning` منزوعة النقطة، فيبقى اللون وحده هو الفارق. */}
        {card.organizationActive ? null : <Badge tone="warning">غير متاحة حاليًا</Badge>}
      </div>

      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="lux-number text-3xl font-black text-salon-ink">{formatNumber(card.points)}</span>
        <span className="text-sm font-bold text-salon-charcoal/60">نقطة</span>
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-salon-line/70 pt-3.5 text-center">
        <Stat label="زيارة" value={formatNumber(card.visitCount)} />
        <Stat label={card.branchCount === 1 ? "فرع" : "فروع"} value={formatNumber(card.branchCount)} />
        <Stat label="آخر نشاط" value={formatRelativeDay(card.lastActivityAt)} />
      </dl>

      <span className="mt-4 inline-block text-sm font-bold text-salon-forest">عرض البطاقة ←</span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="text-sm font-bold text-salon-ink">{value}</dd>
      <dt className="mt-0.5 text-[11px] font-semibold text-salon-charcoal/55">{label}</dt>
    </div>
  );
}

export function BranchList({ branches }: { branches: WalletBranch[] }) {
  if (branches.length === 0) {
    return <p className="text-sm font-medium leading-6 text-salon-charcoal/60">لم تُسجَّل لك زيارة في أي فرع بعد.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {branches.map((branch) => (
        <li key={branch.salonId} className="flex items-baseline justify-between gap-3 rounded-xl bg-salon-mist/60 px-3.5 py-3">
          <span className="min-w-0 text-sm font-bold text-salon-ink">
            {branch.name}
            {branch.active ? null : <span className="mr-1.5 text-[11px] font-semibold text-salon-charcoal/50">(مغلق)</span>}
          </span>
          <span className="shrink-0 text-xs font-semibold text-salon-charcoal/60">
            {formatNumber(branch.visits)} زيارة · {formatRelativeDay(branch.lastVisitAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ActivityList({ entries }: { entries: WalletActivityEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm font-medium leading-6 text-salon-charcoal/60">لا حركات نقاط بعد.</p>;
  }
  return (
    <ul className="divide-y divide-salon-line/70">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start justify-between gap-3 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-bold text-salon-ink">{LOYALTY_MOVEMENT_LABEL[entry.type]}</p>
            <p className="mt-0.5 text-xs font-semibold text-salon-charcoal/55">
              {entry.branchName ?? "بلا فرع"} · {formatRelativeDay(entry.createdAt)}
            </p>
          </div>
          <span
            className={`lux-number shrink-0 text-sm font-black ${entry.points >= 0 ? "text-salon-forest" : "text-salon-ruby"}`}
            dir="ltr"
          >
            {entry.points >= 0 ? "+" : "−"}
            {formatNumber(Math.abs(entry.points))}
          </span>
        </li>
      ))}
    </ul>
  );
}
