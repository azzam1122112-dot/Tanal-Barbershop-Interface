import Link from "next/link";
import { PlatformShell } from "@/components/platform/platform-shell";
import { prisma } from "@/lib/db/prisma";
import { getPlatformOverview } from "@/lib/platform/platform-service";
import { formatMoney, formatNumber } from "@/lib/format";

export default async function PlatformOverviewPage() {
  const overview = await getPlatformOverview(prisma);

  const stats: { label: string; value: string; tone?: "gold" | "danger" | "default" }[] = [
    { label: "المؤسسات", value: formatNumber(overview.totals.organizations) },
    { label: "نشطة", value: formatNumber(overview.totals.active) },
    { label: "موقوفة", value: formatNumber(overview.totals.suspended), tone: "danger" },
    { label: "على التجربة", value: formatNumber(overview.totals.trialing) },
    { label: "الفروع", value: formatNumber(overview.totals.salons) },
    { label: "الحلاقون", value: formatNumber(overview.totals.barbers) },
    { label: "العملاء", value: formatNumber(overview.totals.customers) },
    { label: "الإيراد الشهري التقديري", value: formatMoney(overview.estimatedMrr), tone: "gold" },
  ];

  return (
    <PlatformShell active="overview" title="نظرة عامة" description="مؤشرات المنصّة: المؤسسات، الاستهلاك، الإيراد التقديري، والتجارب القاربة على الانتهاء.">
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="dashboard-panel relative overflow-hidden p-4">
            <div className={`absolute inset-x-0 top-0 h-[3px] ${stat.tone === "gold" ? "bg-gold-sheen" : stat.tone === "danger" ? "bg-salon-ruby" : "bg-gradient-to-l from-salon-gold via-salon-forest to-salon-ink"}`} />
            <p className="text-[13px] font-semibold text-salon-charcoal">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="dashboard-panel overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-salon-line/70 px-5 py-4">
            <span className="h-4 w-1 rounded-full bg-gradient-to-b from-salon-ruby to-[#5c1f25]" aria-hidden="true" />
            <h2 className="text-lg font-bold tracking-tight">تجارب تنتهي قريبًا</h2>
          </div>
          <div className="divide-y divide-salon-line/70">
            {overview.expiringTrials.map((trial) => (
              <div key={trial.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-bold text-salon-ink">{trial.name}</p>
                  <p className="text-xs font-medium text-salon-charcoal/70" dir="ltr">{trial.slug}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${(trial.daysLeft ?? 0) <= 2 ? "bg-red-50 text-red-700 ring-red-200/70" : "bg-amber-50 text-amber-700 ring-amber-200/70"}`}>
                  {trial.daysLeft !== null ? `بعد ${trial.daysLeft} يوم` : "—"}
                </span>
              </div>
            ))}
            {overview.expiringTrials.length === 0 ? <p className="px-5 py-6 text-center text-sm text-salon-charcoal">لا توجد تجارب قاربة على الانتهاء.</p> : null}
          </div>
        </section>

        <section className="dashboard-panel overflow-hidden">
          <div className="flex items-center justify-between gap-2.5 border-b border-salon-line/70 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="h-4 w-1 rounded-full bg-gradient-to-b from-salon-gold to-[#8f6c39]" aria-hidden="true" />
              <h2 className="text-lg font-bold tracking-tight">أحدث المؤسسات</h2>
            </div>
            <Link href="/platform/organizations" className="text-xs font-bold text-salon-gold hover:underline">عرض الكل</Link>
          </div>
          <div className="divide-y divide-salon-line/70">
            {overview.recentOrganizations.map((org) => (
              <div key={org.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-bold text-salon-ink">{org.name}</p>
                  <p className="text-xs font-medium text-salon-charcoal/70" dir="ltr">{org.slug} · {org.plan?.name ?? "بلا باقة"}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${org.status === "ACTIVE" ? "bg-green-50 text-green-700 ring-green-200/70" : "bg-red-50 text-red-700 ring-red-200/70"}`}>
                  {org.status === "ACTIVE" ? "نشطة" : "موقوفة"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PlatformShell>
  );
}
