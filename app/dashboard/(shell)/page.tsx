import Link from "next/link";
import { formatMoney, formatNumber } from "@/lib/format";
import { redirect } from "next/navigation";
import { getSmartAlerts } from "@/lib/alerts/smart-alerts";
import { getRequestSession } from "@/lib/auth/http";
import { canAccessDashboard } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { DashboardShell, EmptyState, SectionPanel, StatCard, StatGroup } from "@/components/dashboard/ui";
import { prisma } from "@/lib/db/prisma";
import { getOperationAlerts } from "@/lib/daily-close/operation-alerts";
import { getDashboardSummary } from "@/lib/reports/dashboard-reports";

export default async function DashboardPage() {
  const session = await getRequestSession();

  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const { organizationId, salonIds } = dashboardScope(session);
  const [summary, operationAlerts, smartAlerts] = await Promise.all([
    getDashboardSummary(prisma, organizationId, salonIds),
    getOperationAlerts(prisma, new Date(), organizationId, salonIds),
    organizationId ? getSmartAlerts(prisma, { organizationId, salonIds }) : Promise.resolve([]),
  ]);

  return (
    <DashboardShell title="ملخص اليوم التشغيلي" description="نظرة فورية على دخل اليوم، حركة الزيارات، الجلسات المفتوحة، وأبرز التنبيهات التشغيلية.">
      <StatGroup title="دخل اليوم">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="الدخل الصافي" value={formatMoney(summary.netAmount)} tone="gold" />
          <StatCard label="الكاش" value={formatMoney(summary.cashAmount)} />
          <StatCard label="الشبكة" value={formatMoney(summary.networkAmount)} />
          <StatCard
            label="إجمالي الخصومات"
            value={formatMoney(summary.discountAmount)}
            hint="مجموع ما مُنح من مكافآت وحملات اليوم"
          />
        </div>
      </StatGroup>

      <StatGroup title="حركة اليوم">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="الزيارات" value={formatNumber(summary.visitsCount)} />
          <StatCard label="عملاء جدد" value={formatNumber(summary.newCustomersCount)} tone="success" />
          <StatCard
            label="أفضل حلاق"
            value={summary.bestBarberToday?.name ?? "—"}
            subValue={summary.bestBarberToday ? formatMoney(summary.bestBarberToday.netAmount) : undefined}
          />
          <StatCard
            label="أكثر خدمة طلبًا"
            value={summary.topServiceToday?.name ?? "—"}
            subValue={summary.topServiceToday ? `${formatNumber(summary.topServiceToday.usageCount)} طلب` : undefined}
          />
        </div>
      </StatGroup>

      <StatGroup title="الصندوق والولاء">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="كاش في جلسات مفتوحة"
            value={formatNumber(operationAlerts.openCashBarbersCount)}
            subValue={formatMoney(operationAlerts.unclosedCashTotal)}
            tone={operationAlerts.openCashBarbersCount > 0 ? "danger" : "neutral"}
            hint="حلاقون لديهم كاش لم يُسلَّم بعد"
          />
          <StatCard label="جلسات مغلقة اليوم" value={formatNumber(operationAlerts.closesTodayCount)} />
          <StatCard label="النقاط المكتسبة" value={formatNumber(summary.pointsEarned)} />
          <StatCard label="النقاط المستبدلة" value={formatNumber(summary.pointsRedeemed)} />
        </div>
      </StatGroup>

      {smartAlerts.length > 0 ? (
        <SectionPanel title="ما يحتاج انتباهك">
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {smartAlerts.map((alert) => (
              <Link
                key={alert.id}
                href={alert.href ?? "/dashboard"}
                className={`lux-hover block rounded-xl border px-4 py-3.5 transition ${
                  alert.severity === "critical"
                    ? "border-red-200 bg-red-50 text-red-900 hover:border-red-300"
                    : alert.severity === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-300"
                      : "border-salon-line bg-salon-pearl/70 text-salon-ink hover:border-salon-gold"
                }`}
              >
                <p className="text-sm font-bold">{alert.title}</p>
                <p className="mt-1 text-sm font-medium leading-6 opacity-85">{alert.detail}</p>
              </Link>
            ))}
          </div>
        </SectionPanel>
      ) : null}

      <SectionPanel title="التنبيهات التشغيلية">
        {operationAlerts.alerts.length > 0 ? (
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {operationAlerts.alerts.map((alert, index) => (
              <div key={`${alert.type}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-bold">{alert.message}</p>
                {"amount" in alert ? <p className="mt-1 font-semibold">{formatMoney(alert.amount ?? 0)}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState title="الأمور مستقرة اليوم" description="لا توجد تنبيهات تشغيلية تحتاج متابعة الآن." />
          </div>
        )}
      </SectionPanel>
    </DashboardShell>
  );
}
