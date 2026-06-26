import { redirect } from "next/navigation";
import { DashboardShell, SectionPanel, StatCard } from "@/components/dashboard/ui";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { getOrganizationSubscriptionOverview, type PlanSummary } from "@/lib/plans/subscription-service";

function limitText(value: number | null, unit: string) {
  return value === null ? `غير محدود ${unit}` : `${formatNumber(value)} ${unit}`;
}

function usageText(used: number, limit: number | null, unit: string) {
  return limit === null ? `${formatNumber(used)} ${unit} مستخدم` : `${formatNumber(used)} من ${formatNumber(limit)} ${unit}`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    TRIALING: "تجربة",
    ACTIVE: "نشط",
    PAST_DUE: "متأخر الدفع",
    CANCELED: "ملغي",
  };
  return labels[status] ?? status;
}

function PlanCard({
  plan,
  currentPlanId,
  usage,
}: {
  plan: PlanSummary;
  currentPlanId: string | null;
  usage: { salons: number; barbers: number; customers: number };
}) {
  const isCurrent = plan.id === currentPlanId;
  const canFitCurrentUsage =
    usage.salons <= plan.maxSalons &&
    (plan.maxBarbers === null || usage.barbers <= plan.maxBarbers) &&
    (plan.maxCustomers === null || usage.customers <= plan.maxCustomers);

  return (
    <article className={`dashboard-panel flex h-full flex-col p-5 ${isCurrent ? "ring-2 ring-salon-gold/60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-salon-ink">{plan.name}</p>
          <p className="mt-1 text-xs font-bold text-salon-charcoal/65" dir="ltr">{plan.slug}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${isCurrent ? "bg-salon-gold/15 text-salon-gold" : "bg-salon-mist text-salon-charcoal"}`}>
          {isCurrent ? "باقتك الحالية" : plan.priceMonthly === 0 ? "مجانية" : "ترقية"}
        </span>
      </div>

      {plan.description ? <p className="dashboard-muted mt-4">{plan.description}</p> : null}

      <p className="mt-5 text-3xl font-black tracking-tight">{plan.priceMonthly === 0 ? "مجانية" : formatMoney(plan.priceMonthly)}</p>
      <p className="mt-1 text-xs font-bold text-salon-charcoal/60">شهريًا</p>

      <div className="lux-rule my-5" />

      <dl className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="font-bold text-salon-charcoal">الفروع</dt>
          <dd className="font-black">{limitText(plan.maxSalons, "فرع")}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="font-bold text-salon-charcoal">الحلاقون</dt>
          <dd className="font-black">{limitText(plan.maxBarbers, "حلاق")}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="font-bold text-salon-charcoal">العملاء</dt>
          <dd className="font-black">{limitText(plan.maxCustomers, "عميل")}</dd>
        </div>
      </dl>

      <div className="mt-5 flex-1 rounded-xl border border-salon-line/70 bg-salon-pearl/80 p-3 text-xs font-bold leading-6 text-salon-charcoal">
        {canFitCurrentUsage ? "هذه الباقة تستوعب استخدامك الحالي." : "استخدامك الحالي يتجاوز حدود هذه الباقة."}
      </div>

      {isCurrent ? (
        <button type="button" disabled className="dashboard-button-soft mt-4 w-full opacity-70">
          مستخدمة الآن
        </button>
      ) : (
        <a
          href={`https://wa.me/966537720207?text=${encodeURIComponent(`السلام عليكم، أرغب بترقية اشتراك مؤسستي إلى باقة «${plan.name}».`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="dashboard-button-gold mt-4 w-full"
        >
          طلب الترقية عبر واتساب
        </a>
      )}
    </article>
  );
}

export default async function DashboardSubscriptionPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (session.type !== "dashboard" || session.role === "SUPERVISOR") redirect("/dashboard");

  const overview = await getOrganizationSubscriptionOverview(prisma, session.organizationId);
  if (!overview) redirect("/dashboard/login");

  const currentPlan = overview.organization.plan;
  const usage = overview.organization.usage;

  return (
    <DashboardShell
      title="الباقة والترقية"
      description="حدود باقتك الحالية وخيارات الترقية تأتي مباشرة من لوحة المنصة."
    >
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="الباقة الحالية" value={currentPlan?.name ?? "غير محددة"} subValue={statusLabel(overview.organization.subscriptionStatus)} />
        <StatCard label="الفروع" value={usageText(usage.salons, currentPlan?.maxSalons ?? null, "فرع")} />
        <StatCard label="الحلاقون" value={usageText(usage.barbers, currentPlan?.maxBarbers ?? null, "حلاق")} />
        <StatCard label="العملاء" value={usageText(usage.customers, currentPlan?.maxCustomers ?? null, "عميل")} />
      </div>

      <SectionPanel title="تفاصيل المؤسسة">
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-bold text-salon-charcoal/65">اسم المؤسسة</p>
            <p className="mt-1 font-black">{overview.organization.name}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-salon-charcoal/65">المعرّف</p>
            <p className="mt-1 font-black" dir="ltr">{overview.organization.slug}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-salon-charcoal/65">نهاية التجربة</p>
            <p className="mt-1 font-black">{formatDate(overview.organization.trialEndsAt)}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-salon-charcoal/65">نهاية الفترة الحالية</p>
            <p className="mt-1 font-black">{formatDate(overview.organization.currentPeriodEnd)}</p>
          </div>
        </div>
      </SectionPanel>

      <SectionPanel title="الباقات المتاحة">
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {overview.plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} currentPlanId={currentPlan?.id ?? null} usage={usage} />
          ))}
          {overview.plans.length === 0 ? (
            <p className="rounded-xl border border-dashed border-salon-line bg-white/80 px-5 py-8 text-center text-sm font-bold text-salon-charcoal">
              لا توجد باقات فعّالة حاليًا. فعّل باقة واحدة على الأقل من لوحة المنصة.
            </p>
          ) : null}
        </div>
      </SectionPanel>
    </DashboardShell>
  );
}
