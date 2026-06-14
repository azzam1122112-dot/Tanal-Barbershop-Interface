import { redirect } from "next/navigation";
import { getRequestSession } from "@/lib/auth/http";
import { canAccessDashboard } from "@/lib/auth/access";
import { DashboardShell, StatCard } from "@/components/dashboard/ui";
import { prisma } from "@/lib/db/prisma";
import { getOperationAlerts } from "@/lib/daily-close/operation-alerts";
import { getDashboardSummary } from "@/lib/reports/dashboard-reports";

export default async function DashboardPage() {
  const session = await getRequestSession();

  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const [summary, operationAlerts] = await Promise.all([
    getDashboardSummary(prisma),
    getOperationAlerts(prisma),
  ]);

  return (
    <DashboardShell title="ملخص اليوم التشغيلي">
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
    </DashboardShell>
  );
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ريال`;
}
