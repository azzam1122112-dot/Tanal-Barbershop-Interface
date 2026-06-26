import { formatMoney } from "@/lib/format";
import { redirect } from "next/navigation";
import { getRequestSession } from "@/lib/auth/http";
import { canAccessDashboard } from "@/lib/auth/access";
import { DashboardShell, EmptyState, SectionPanel, StatCard } from "@/components/dashboard/ui";
import { prisma } from "@/lib/db/prisma";
import { getOperationAlerts } from "@/lib/daily-close/operation-alerts";
import { getDashboardSummary } from "@/lib/reports/dashboard-reports";

export default async function DashboardPage() {
  const session = await getRequestSession();

  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const organizationId = session.type === "dashboard" ? session.organizationId : undefined;
  const [summary, operationAlerts] = await Promise.all([
    getDashboardSummary(prisma, organizationId),
    getOperationAlerts(prisma, new Date(), organizationId),
  ]);

  return (
    <DashboardShell title="ملخص اليوم التشغيلي" description="نظرة فورية على دخل اليوم، حركة الزيارات، الجلسات المفتوحة، وأبرز التنبيهات التشغيلية.">
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="دخل اليوم" value={formatMoney(summary.netAmount)} />
        <StatCard label="الكاش اليوم" value={formatMoney(summary.cashAmount)} />
        <StatCard label="الشبكة اليوم" value={formatMoney(summary.networkAmount)} />
        <StatCard label="زيارات اليوم" value={summary.visitsCount.toString()} />
        <StatCard label="عملاء جدد اليوم" value={summary.newCustomersCount.toString()} />
        <StatCard label="إجمالي الخصومات" value={formatMoney(summary.discountAmount)} />
        <StatCard label="النقاط المكتسبة" value={summary.pointsEarned.toString()} />
        <StatCard label="النقاط المستبدلة" value={summary.pointsRedeemed.toString()} />
        <StatCard label="أفضل حلاق" value={summary.bestBarberToday?.name ?? "-"} subValue={summary.bestBarberToday ? formatMoney(summary.bestBarberToday.netAmount) : undefined} />
        <StatCard label="أكثر خدمة طلبًا" value={summary.topServiceToday?.name ?? "-"} subValue={summary.topServiceToday ? `${summary.topServiceToday.usageCount} طلب` : undefined} />
        <StatCard label="كاش في جلسات مفتوحة" value={operationAlerts.openCashBarbersCount.toString()} subValue={formatMoney(operationAlerts.unclosedCashTotal)} />
        <StatCard label="جلسات مغلقة اليوم" value={operationAlerts.closesTodayCount.toString()} />
        <StatCard label="تنبيهات تشغيلية" value={operationAlerts.alerts.length.toString()} />
      </div>

      <SectionPanel title="التنبيهات التشغيلية">
        {operationAlerts.alerts.length > 0 ? (
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {operationAlerts.alerts.map((alert, index) => (
              <div key={`${alert.type}-${index}`} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-black">{alert.message}</p>
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
