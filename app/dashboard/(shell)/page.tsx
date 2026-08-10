import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { DashboardShell, EmptyState, SectionPanel, StatCard, StatGroup } from "@/components/dashboard/ui";
import { getSmartAlerts } from "@/lib/alerts/smart-alerts";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getDashboardRoleCopy } from "@/lib/auth/role-copy";
import { getOperationAlerts } from "@/lib/daily-close/operation-alerts";
import { prisma } from "@/lib/db/prisma";
import { formatMoney, formatNumber } from "@/lib/format";
import { getDashboardSummary, getTodayRange } from "@/lib/reports/dashboard-reports";

export default async function DashboardPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session) || session.type !== "dashboard") redirect("/barber");
  if (!session.organizationId) redirect("/dashboard/login");

  const organizationId = session.organizationId;
  const { salonIds, activeSalonId, isAggregate } = dashboardScope(session);
  const { from, to } = getTodayRange();
  const salonFilter = salonIds && salonIds.length > 0 ? { salonId: { in: salonIds } } : {};
  const appointmentBase = { organizationId, ...salonFilter, startAt: { gte: from, lt: to } };

  const [summary, operationAlerts, smartAlerts, bookedAppointments, arrivedAppointments, noShows, activeSalon] = await Promise.all([
    getDashboardSummary(prisma, organizationId, salonIds),
    getOperationAlerts(prisma, new Date(), organizationId, salonIds),
    getSmartAlerts(prisma, { organizationId, salonIds }),
    prisma.appointment.count({ where: { ...appointmentBase, status: "BOOKED" } }),
    prisma.appointment.count({ where: { ...appointmentBase, status: "ARRIVED" } }),
    prisma.appointment.count({ where: { ...appointmentBase, status: "NO_SHOW" } }),
    activeSalonId ? prisma.salon.findUnique({ where: { id: activeSalonId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const roleCopy = getDashboardRoleCopy(session.role);
  const isBranchManager = session.role === "SUPERVISOR";
  const scopeLabel = activeSalon?.name ?? (isBranchManager ? (isAggregate ? "الفروع المسندة" : "الفرع المسند") : "جميع الفروع");
  const pageTitle = isBranchManager ? "تشغيل الفرع اليوم" : session.role === "OWNER" ? "مركز قيادة المؤسسة" : "مركز إدارة المؤسسة";

  return (
    <DashboardShell
      eyebrow={roleCopy.panelEyebrow}
      title={pageTitle}
      description={`${scopeLabel} · القرار يبدأ بما يحتاج إجراءً الآن، ثم مؤشرات اليوم.`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/appointments" className="dashboard-button-soft px-3.5 py-2.5 text-xs">المواعيد</Link>
          <Link href="/dashboard/reports" className="dashboard-button-gold px-3.5 py-2.5 text-xs">التقارير</Link>
        </div>
      }
    >
      <section className="mt-6 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <div className="dashboard-panel overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-salon-line/70 bg-gradient-to-l from-salon-ink to-[#2b1c44] px-5 py-4 text-white">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-salon-goldlight">مركز الإجراءات</p>
              <h2 className="mt-1 text-xl font-bold">ما يحتاج انتباهك الآن</h2>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{formatNumber(smartAlerts.length + operationAlerts.alerts.length)} تنبيه</span>
          </div>
          {smartAlerts.length + operationAlerts.alerts.length > 0 ? (
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {smartAlerts.slice(0, 4).map((alert) => (
                <Link key={alert.id} href={alert.href ?? "/dashboard"} className={`rounded-xl border px-4 py-3.5 transition hover:-translate-y-0.5 ${alert.severity === "critical" ? "border-red-200 bg-red-50 text-red-900" : alert.severity === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-salon-line bg-salon-pearl/70 text-salon-ink"}`}>
                  <p className="text-sm font-bold">{alert.title}</p>
                  <p className="mt-1 text-xs font-semibold leading-6 opacity-80">{alert.detail}</p>
                </Link>
              ))}
              {operationAlerts.alerts.slice(0, Math.max(0, 4 - smartAlerts.length)).map((alert, index) => (
                <Link key={`${alert.type}-${index}`} href="/dashboard/daily-close" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900 transition hover:-translate-y-0.5">
                  <p className="text-sm font-bold">{alert.message}</p>
                  {"amount" in alert ? <p className="mt-1 text-xs font-semibold">{formatMoney(alert.amount ?? 0)}</p> : null}
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4"><EmptyState title="التشغيل مستقر" description="لا توجد إجراءات عاجلة ضمن نطاقك حاليًا." /></div>
          )}
        </div>

        <aside className="dashboard-panel relative overflow-hidden bg-salon-ink p-5 text-white">
          <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-salon-gold/20 blur-3xl" aria-hidden="true" />
          <p className="relative text-xs font-bold text-salon-goldlight">صافي دخل اليوم</p>
          <p className="relative mt-3 text-4xl font-black tabular-nums tracking-tight sm:text-5xl">{formatMoney(summary.netAmount)}</p>
          <div className="relative mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
            <MetricMini label="متوسط الفاتورة" value={formatMoney(summary.averageTicket)} />
            <MetricMini label="الزيارات" value={formatNumber(summary.visitsCount)} />
            <MetricMini label="الكاش" value={formatMoney(summary.cashAmount)} />
            <MetricMini label="الشبكة" value={formatMoney(summary.networkAmount)} />
          </div>
        </aside>
      </section>

      <StatGroup title="نبض التشغيل اليومي">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="مواعيد بانتظار الوصول" value={formatNumber(bookedAppointments)} tone={bookedAppointments > 0 ? "gold" : "neutral"} />
          <StatCard label="عملاء وصلوا" value={formatNumber(arrivedAppointments)} tone={arrivedAppointments > 0 ? "success" : "neutral"} />
          <StatCard label="عدم حضور" value={formatNumber(noShows)} tone={noShows > 0 ? "danger" : "neutral"} />
          <StatCard label="جلسات كاش مفتوحة" value={formatNumber(operationAlerts.openCashBarbersCount)} subValue={formatMoney(operationAlerts.unclosedCashTotal)} tone={operationAlerts.openCashBarbersCount > 0 ? "danger" : "neutral"} />
        </div>
      </StatGroup>

      <StatGroup title={isBranchManager ? "أداء الفرع" : "قراءة الإدارة"}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="عملاء جدد" value={formatNumber(summary.newCustomersCount)} tone="success" />
          <StatCard label="إجمالي الخصومات" value={formatMoney(summary.discountAmount)} />
          <StatCard label="أفضل حلاق اليوم" value={summary.bestBarberToday?.name ?? "—"} subValue={summary.bestBarberToday ? formatMoney(summary.bestBarberToday.netAmount) : undefined} />
          <StatCard label="أكثر خدمة طلبًا" value={summary.topServiceToday?.name ?? "—"} subValue={summary.topServiceToday ? `${formatNumber(summary.topServiceToday.usageCount)} طلب` : undefined} />
        </div>
      </StatGroup>

      <SectionPanel title={isBranchManager ? "اختصارات تشغيل الفرع" : "اختصارات الإدارة"}>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <CommandLink href="/dashboard/appointments" icon="visits" title="إدارة المواعيد" description="الوصول والحجز وعدم الحضور" />
          <CommandLink href="/dashboard/daily-close" icon="cash" title="مراجعة الصندوق" description="الجلسات والتحصيل والفروقات" />
          <CommandLink href="/dashboard/customers" icon="customers" title="العملاء" description="السجل والولاء والتواصل" />
          <CommandLink href={isBranchManager ? "/dashboard/attendance" : "/dashboard/reports"} icon={isBranchManager ? "staff" : "reports"} title={isBranchManager ? "حضور الفريق" : "التقارير المتقدمة"} description={isBranchManager ? "الحضور والانصراف اليومي" : "تحليل الفترات والفروع"} />
        </div>
      </SectionPanel>
    </DashboardShell>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] font-semibold text-white/45">{label}</p><p className="mt-1 font-bold tabular-nums text-white">{value}</p></div>;
}

function CommandLink({ href, icon, title, description }: { href: string; icon: IconName; title: string; description: string }) {
  return (
    <Link href={href} className="lux-hover group flex items-center gap-3 rounded-xl border border-salon-line/70 bg-white px-4 py-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-salon-ink text-salon-gold transition group-hover:bg-salon-gold group-hover:text-white"><Icon name={icon} className="h-5 w-5" /></span>
      <span className="min-w-0"><span className="block font-bold text-salon-ink">{title}</span><span className="mt-1 block text-xs font-semibold leading-5 text-salon-charcoal">{description}</span></span>
    </Link>
  );
}
