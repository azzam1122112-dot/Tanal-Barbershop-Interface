import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { PlatformShell } from "@/components/platform/platform-shell";
import { prisma } from "@/lib/db/prisma";
import { getPlatformOverview } from "@/lib/platform/platform-service";
import { getPlatformRevenueSummary } from "@/lib/billing/billing-service";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { auditActionLabel } from "@/lib/audit/presentation";

export default async function PlatformOverviewPage() {
  const [overview, revenue] = await Promise.all([getPlatformOverview(prisma), getPlatformRevenueSummary(prisma)]);
  const urgentCount = overview.attention.pendingPayments + overview.attention.expiredTrials + overview.attention.pastDue + overview.totals.suspended;

  return (
    <PlatformShell
      active="overview"
      title="مركز قيادة المنصة"
      description="الاشتراكات والتحصيل وصحة المؤسسات في واجهة واحدة. تشغيل الفروع يبقى داخل لوحات المؤسسات ولا يظهر هنا."
      actions={<Link href="/platform/organizations" className="dashboard-button-gold px-4 py-2.5 text-xs">إدارة المؤسسات</Link>}
    >
      <section className="mt-6 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <div className="dashboard-panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-salon-line/70 bg-gradient-to-l from-salon-ink to-[#2b1c44] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-salon-goldlight">قائمة العمل</p><h2 className="mt-1 text-xl font-bold">الإجراءات المطلوبة</h2></div>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${urgentCount > 0 ? "bg-red-500/20 text-red-100 ring-1 ring-red-300/20" : "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-300/20"}`}>{urgentCount > 0 ? `${formatNumber(urgentCount)} تحتاج متابعة` : "لا توجد إجراءات عاجلة"}</span>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <ActionTile href="/platform/organizations?payment=pending" icon="billing" label="طلبات دفع تنتظر المراجعة" value={overview.attention.pendingPayments} tone={overview.attention.pendingPayments > 0 ? "danger" : "success"} />
            <ActionTile href="/platform/organizations?subscription=expired-trial" icon="bell" label="تجارب انتهت دون تفعيل" value={overview.attention.expiredTrials} tone={overview.attention.expiredTrials > 0 ? "warning" : "success"} />
            <ActionTile href="/platform/organizations?subscription=PAST_DUE" icon="cash" label="اشتراكات متأخرة" value={overview.attention.pastDue} tone={overview.attention.pastDue > 0 ? "danger" : "success"} />
            <ActionTile href="/platform/organizations?status=SUSPENDED" icon="adjustments" label="مؤسسات موقوفة" value={overview.totals.suspended} tone={overview.totals.suspended > 0 ? "warning" : "success"} />
          </div>
        </div>

        <aside className="dashboard-panel relative overflow-hidden bg-salon-ink p-5 text-white">
          <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-salon-gold/20 blur-3xl" aria-hidden="true" />
          <p className="relative text-xs font-bold text-salon-goldlight">المحصّل هذا الشهر</p>
          <p className="relative mt-3 text-4xl font-black tabular-nums tracking-tight">{formatMoney(revenue.collectedThisMonth)}</p>
          <div className="relative mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <PlatformMiniMetric label="دفعات الشهر" value={formatNumber(revenue.paymentsThisMonth)} />
            <PlatformMiniMetric label="MRR تقديري" value={formatMoney(overview.estimatedMrr)} />
            <PlatformMiniMetric label="إجمالي المحصّل" value={formatMoney(revenue.collectedAllTime)} />
            <PlatformMiniMetric label="تجديد خلال 14 يومًا" value={formatNumber(revenue.expiringSoon)} />
          </div>
        </aside>
      </section>

      <section className="mt-6">
        <div className="mb-2.5 flex items-center gap-2.5"><span className="h-3.5 w-1 rounded-full bg-salon-gold" /><h2 className="text-[13px] font-bold uppercase tracking-eyebrow text-salon-charcoal">نمو المنصة</h2><span className="lux-rule flex-1" /></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PlatformStat label="المؤسسات" value={overview.totals.organizations} hint={`${formatNumber(overview.totals.organizationsThisMonth)} جديدة هذا الشهر`} />
          <PlatformStat label="اشتراكات نشطة" value={overview.totals.active} hint={`${formatNumber(overview.totals.trialing)} على التجربة`} tone="success" />
          <PlatformStat label="الفروع" value={overview.totals.salons} hint="إجمالي الوحدات التشغيلية" />
          <PlatformStat label="المستخدمون النهائيون" value={overview.totals.customers} hint={`${formatNumber(overview.totals.barbers)} حلاق`} />
        </div>
      </section>

      {overview.pendingPayments.length > 0 ? (
        <section className="dashboard-panel mt-6 overflow-hidden" id="pending-payments">
          <SectionHeading title="طلبات الدفع المنتظرة" href="/platform/organizations" />
          <div className="divide-y divide-salon-line/70">
            {overview.pendingPayments.map((payment) => (
              <Link key={payment.id} href={`/platform/organizations/${payment.organizationId}#billing`} className="grid gap-2 px-5 py-4 transition hover:bg-salon-gold/[0.05] sm:grid-cols-[1fr_auto_auto] sm:items-center">
                <div className="min-w-0"><p className="font-bold text-salon-ink">{payment.organizationName}</p><p className="mt-1 text-xs font-semibold text-salon-charcoal/65" dir="ltr">{payment.organizationSlug} · {payment.reference ?? "بلا مرجع"}</p></div>
                <p className="text-sm font-bold text-salon-charcoal">{payment.planName ?? "باقة غير محددة"} · {payment.periodMonths} شهر</p>
                <p className="text-lg font-black tabular-nums text-salon-forest">{formatMoney(payment.amount)}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="dashboard-panel overflow-hidden">
          <SectionHeading title="التجديدات القادمة" href="/platform/organizations" />
          <div className="divide-y divide-salon-line/70">
            {overview.expiringSubscriptions.map((org) => <OrganizationLine key={org.id} id={org.id} name={org.name} slug={org.slug} meta={`ينتهي ${formatDate(org.currentPeriodEnd)}`} tone="warning" />)}
            {overview.expiringSubscriptions.length === 0 ? <EmptyLine text="لا توجد اشتراكات تنتهي خلال أسبوعين." /> : null}
          </div>
        </section>

        <section className="dashboard-panel overflow-hidden">
          <SectionHeading title="أحدث المؤسسات" href="/platform/organizations" />
          <div className="divide-y divide-salon-line/70">
            {overview.recentOrganizations.map((org) => <OrganizationLine key={org.id} id={org.id} name={org.name} slug={org.slug} meta={org.plan?.name ?? "بلا باقة"} tone={org.status === "ACTIVE" ? "success" : "danger"} />)}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <section className="dashboard-panel overflow-hidden">
          <SectionHeading title="آخر إجراءات إدارة المنصة" />
          <div className="divide-y divide-salon-line/70">
            {overview.recentPlatformActivity.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0"><p className="truncate text-sm font-bold text-salon-ink">{auditActionLabel(entry.action)}</p><p className="mt-1 text-xs font-semibold text-salon-charcoal/60">{entry.organization?.name ?? "مستوى المنصة"}</p></div>
                <time className="shrink-0 text-xs font-semibold text-salon-charcoal/60">{formatDateTime(entry.createdAt)}</time>
              </div>
            ))}
            {overview.recentPlatformActivity.length === 0 ? <EmptyLine text="لا يوجد نشاط إداري حديث." /> : null}
          </div>
        </section>

        <section className="dashboard-panel overflow-hidden">
          <SectionHeading title="جاهزية المنصة" />
          <div className="space-y-3 p-4">
            <HealthRow label="التطبيق" detail="الصفحة تعمل وتستجيب" state="ok" />
            <HealthRow label="قاعدة البيانات" detail="تم تنفيذ استعلام المتابعة بنجاح" state="ok" />
            <HealthRow label="النسخ الاحتياطية" detail="لا توجد حالة نسخ احتياطي مرتبطة باللوحة" state="unknown" />
            <HealthRow label="المهام المجدولة" detail="لا يوجد سجل تشغيل ظاهر لمدير النظام" state="unknown" />
          </div>
        </section>
      </div>
    </PlatformShell>
  );
}

function ActionTile({ href, icon, label, value, tone }: { href: string; icon: IconName; label: string; value: number; tone: "success" | "warning" | "danger" }) {
  const styles = tone === "danger" ? "border-red-200 bg-red-50 text-red-900" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return <Link href={href} className={`flex items-center gap-3 rounded-xl border px-4 py-4 transition hover:-translate-y-0.5 ${styles}`}><span className="grid h-10 w-10 place-items-center rounded-lg bg-white/70"><Icon name={icon} className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-xs font-semibold opacity-70">اضغط للمتابعة</span></span><strong className="text-2xl font-black tabular-nums">{formatNumber(value)}</strong></Link>;
}

function PlatformMiniMetric({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] font-semibold text-white/45">{label}</p><p className="mt-1 text-sm font-bold tabular-nums">{value}</p></div>; }

function PlatformStat({ label, value, hint, tone = "neutral" }: { label: string; value: number; hint: string; tone?: "neutral" | "success" }) { return <div className="dashboard-panel relative overflow-hidden p-4"><span className={`absolute inset-y-0 right-0 w-[3px] ${tone === "success" ? "bg-emerald-500" : "bg-salon-gold"}`} /><p className="text-xs font-semibold text-salon-charcoal">{label}</p><p className="mt-2 text-3xl font-black tabular-nums">{formatNumber(value)}</p><p className="mt-2 text-xs font-semibold text-salon-charcoal/65">{hint}</p></div>; }

function SectionHeading({ title, href }: { title: string; href?: string }) { return <div className="flex items-center justify-between gap-3 border-b border-salon-line/70 bg-gradient-to-b from-[#fbfaf6] to-[#f6f3ec] px-5 py-4"><div className="flex items-center gap-2.5"><span className="h-4 w-1 rounded-full bg-salon-gold" /><h2 className="text-lg font-bold">{title}</h2></div>{href ? <Link href={href} className="text-xs font-bold text-salon-gold hover:underline">عرض الكل</Link> : null}</div>; }

function OrganizationLine({ id, name, slug, meta, tone }: { id: string; name: string; slug: string; meta: string; tone: "success" | "warning" | "danger" }) { const dot = tone === "success" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-500" : "bg-red-500"; return <Link href={`/platform/organizations/${id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-salon-gold/[0.05]"><div className="min-w-0"><p className="truncate font-bold text-salon-ink">{name}</p><p className="mt-0.5 truncate text-xs font-semibold text-salon-charcoal/60" dir="ltr">{slug}</p></div><span className="flex shrink-0 items-center gap-2 text-xs font-bold text-salon-charcoal"><span className={`h-2 w-2 rounded-full ${dot}`} />{meta}</span></Link>; }

function EmptyLine({ text }: { text: string }) { return <p className="px-5 py-8 text-center text-sm font-semibold text-salon-charcoal/65">{text}</p>; }

function HealthRow({ label, detail, state }: { label: string; detail: string; state: "ok" | "unknown" }) { return <div className="flex items-center gap-3 rounded-xl border border-salon-line/70 bg-white px-3.5 py-3"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${state === "ok" ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.12)]" : "bg-amber-400 shadow-[0_0_0_4px_rgba(245,158,11,.12)]"}`} /><div><p className="text-sm font-bold">{label}</p><p className="mt-0.5 text-xs font-semibold text-salon-charcoal/65">{detail}</p></div></div>; }
