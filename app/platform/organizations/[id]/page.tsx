import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformShell } from "@/components/platform/platform-shell";
import { OrgSubscriptionManager } from "@/components/platform/org-subscription-manager";
import { OrgAccessManager } from "@/components/platform/org-access-manager";
import { OrgDelete } from "@/components/platform/org-delete";
import { prisma } from "@/lib/db/prisma";
import { getOrganizationDetail, listPlans } from "@/lib/platform/platform-service";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";

const SUB_LABELS: Record<string, string> = { TRIALING: "تجربة", ACTIVE: "نشط", PAST_DUE: "متأخر", CANCELED: "ملغى" };

function usageText(used: number, limit: number | null) {
  return limit === null ? `${formatNumber(used)} / ∞` : `${formatNumber(used)} / ${formatNumber(limit)}`;
}

export default async function PlatformOrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [org, plans] = await Promise.all([getOrganizationDetail(prisma, id), listPlans(prisma)]);
  if (!org) notFound();

  return (
    <PlatformShell active="orgs" title={org.name} description={`تفاصيل المؤسسة ${org.slug} وفروعها وفريقها وسجلّها.`}>
      <div className="mt-4">
        <Link href="/platform/organizations" className="text-xs font-bold text-salon-gold hover:underline">→ كل المؤسسات</Link>
      </div>

      {/* الحالة + الاشتراك */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "الحالة", value: org.status === "ACTIVE" ? "نشطة" : "موقوفة", danger: org.status !== "ACTIVE" },
          {
            label: "الاشتراك",
            value: SUB_LABELS[org.subscriptionStatus] ?? org.subscriptionStatus,
            sub:
              org.subscriptionStatus === "ACTIVE"
                ? `ينتهي ${formatDate(org.currentPeriodEnd)}`
                : org.subscriptionStatus === "TRIALING"
                  ? `التجربة حتى ${formatDate(org.trialEndsAt)}`
                  : undefined,
          },
          { label: "الباقة", value: org.plan?.name ?? "بلا باقة", sub: org.plan ? formatMoney(org.plan.priceMonthly) : undefined },
          { label: "تاريخ الإنشاء", value: formatDate(org.createdAt) },
        ].map((card) => (
          <div key={card.label} className="dashboard-panel relative overflow-hidden p-4">
            <div className={`absolute inset-x-0 top-0 h-[3px] ${card.danger ? "bg-salon-ruby" : "bg-gold-sheen"}`} />
            <p className="text-[13px] font-semibold text-salon-charcoal">{card.label}</p>
            <p className="mt-2 text-xl font-bold tracking-tight">{card.value}</p>
            {card.sub ? <p className="mt-1 text-xs font-medium text-salon-charcoal/70">{card.sub}</p> : null}
          </div>
        ))}
      </div>

      {/* إدارة الاشتراك */}
      <OrgSubscriptionManager
        orgId={org.id}
        initial={{
          status: org.status,
          subscriptionStatus: org.subscriptionStatus,
          planId: org.plan?.id ?? null,
          trialEndsAt: org.trialEndsAt,
          currentPeriodEnd: org.currentPeriodEnd,
        }}
        plans={plans.map((plan) => ({ id: plan.id, name: plan.name, priceMonthly: plan.priceMonthly, maxSalons: plan.maxSalons, maxBarbers: plan.maxBarbers }))}
      />

      {/* الاستهلاك مقابل الحدود */}
      <section className="dashboard-panel mt-6 p-5">
        <h2 className="text-lg font-bold tracking-tight">الاستهلاك مقابل حدود الباقة</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <UsageBar label="الفروع" used={org.usage.salons} limit={org.plan?.maxSalons ?? null} />
          <UsageBar label="الحلاقون" used={org.usage.barbers} limit={org.plan?.maxBarbers ?? null} />
          <UsageBar label="العملاء" used={org.usage.customers} limit={org.plan?.maxCustomers ?? null} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Info label="إجمالي الزيارات" value={formatNumber(org.usage.visits)} />
          <Info label="نهاية التجربة" value={formatDate(org.trialEndsAt)} />
          <Info label="نهاية الاشتراك" value={formatDate(org.currentPeriodEnd)} />
        </div>
      </section>

      {/* بيانات الدخول وإعادة التعيين */}
      <OrgAccessManager orgId={org.id} members={org.members} barbers={org.barbers} />

      {/* الفروع */}
      <section className="dashboard-panel mt-6 overflow-hidden">
        <div className="border-b border-salon-line/70 px-5 py-4"><h2 className="text-lg font-bold tracking-tight">الفروع ({org.salons.length})</h2></div>
        <div className="divide-y divide-salon-line/70">
          {org.salons.map((salon) => (
            <div key={salon.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="font-bold text-salon-ink">{salon.name}</p>
                <p className="text-xs font-medium text-salon-charcoal/70" dir="ltr">{salon.slug} · {salon.barbersCount} حلاق</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${salon.isActive ? "bg-green-50 text-green-700 ring-green-200/70" : "bg-red-50 text-red-700 ring-red-200/70"}`}>
                {salon.isActive ? "نشط" : "معطل"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* سجل التدقيق */}
      <section className="dashboard-panel mt-6 overflow-hidden">
        <div className="border-b border-salon-line/70 px-5 py-4"><h2 className="text-lg font-bold tracking-tight">آخر النشاط</h2></div>
        <div className="divide-y divide-salon-line/70">
          {org.recentAudit.map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="font-bold text-salon-ink" dir="ltr">{log.action}</span>
              <span className="text-xs font-medium text-salon-charcoal/60">{log.entityType} · {formatDateTime(log.createdAt)}</span>
            </div>
          ))}
          {org.recentAudit.length === 0 ? <p className="px-5 py-6 text-center text-sm text-salon-charcoal">لا يوجد نشاط مسجّل.</p> : null}
        </div>
      </section>

      {/* منطقة الخطر */}
      {org.slug !== "default" ? <OrgDelete orgId={org.id} name={org.name} slug={org.slug} /> : null}
    </PlatformShell>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit !== null && used > limit;
  return (
    <div className="rounded-xl border border-salon-line/70 bg-salon-pearl/70 p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-salon-charcoal">{label}</span>
        <span className={`font-bold tabular-nums ${over ? "text-salon-ruby" : "text-salon-ink"}`}>{usageText(used, limit)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-salon-line/60">
        <div className={`h-full rounded-full ${over ? "bg-salon-ruby" : "bg-gold-sheen"}`} style={{ width: `${limit === null ? 6 : pct}%` }} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-salon-line/70 bg-white/70 p-3">
      <p className="text-xs font-bold text-salon-charcoal/65">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
