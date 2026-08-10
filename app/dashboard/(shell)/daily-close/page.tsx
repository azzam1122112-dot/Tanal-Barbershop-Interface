import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell, EmptyState, FilterBar, TablePanel } from "@/components/dashboard/ui";
import { DailyCloseManager } from "@/components/dashboard/daily-close-manager";
import { canAccessDashboard } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { getCashSessionHistory, getCashSessionSummary } from "@/lib/cash-sessions/cash-session-service";
import { prisma } from "@/lib/db/prisma";
import { getPostCloseAdjustmentReport } from "@/lib/post-close-adjustments/post-close-adjustment-report";
import { addRiyadhDays, parseRiyadhDateKey, toRiyadhDateKey } from "@/lib/datetime/riyadh";

export default async function DashboardDailyClosePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; to?: string; barberId?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const params = await searchParams;
  const selectedDateKey = params.date ?? toRiyadhDateKey(new Date());
  const selectedDate = parseRiyadhDateKey(selectedDateKey);
  const last7From = addRiyadhDays(selectedDate, -6);
  const { organizationId, orgWhere, salonWhere, salonIds } = dashboardScope(session);
  const [summary, history, barbers, adjustmentReport] = await Promise.all([
    getCashSessionSummary(prisma, organizationId, salonIds),
    getCashSessionHistory(prisma, { organizationId, salonIds, from: params.from ?? selectedDate, to: params.to ?? selectedDate, barberId: params.barberId }),
    prisma.barber.findMany({ where: { isActive: true, ...orgWhere, ...salonWhere }, orderBy: { name: "asc" } }),
    getPostCloseAdjustmentReport(prisma, { organizationId, salonIds, from: last7From, to: selectedDate }),
  ]);

  return (
    <DashboardShell title="جلسات الصندوق" description="يفتح الحلاق الجلسة ويمكنه إنهاؤها عند التوقف، وتبقى كل جلسة مغلقة ظاهرة للإدارة للتدقيق. التحصيل ونقل العهدة مستقلان في شاشة عهدة الكاش.">
        <form className="dashboard-panel mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <label className="text-sm font-bold text-salon-charcoal">
            تاريخ سجل الجلسات
            <input dir="ltr" lang="en" name="date" type="date" defaultValue={selectedDateKey} className="dashboard-field mt-2" />
          </label>
          <button className="dashboard-button">عرض السجل</button>
        </form>

        <DailyCloseManager initialSummary={summary} />

        <Link href="/dashboard/post-close-adjustments" className="dashboard-panel mt-6 block p-5 font-bold transition hover:border-salon-gold">
          تصحيحات بعد الإغلاق
          <span className="mt-2 block text-sm font-normal text-salon-charcoal">
            {adjustmentReport.summary.count > 0
              ? `يوجد ${adjustmentReport.summary.count} تصحيحات تمت بعد إغلاق جلسات الصندوق خلال آخر 7 أيام`
              : "لا توجد تصحيحات بعد الإغلاق خلال آخر 7 أيام"}
          </span>
        </Link>

        <section className="mt-8">
          <h2 className="text-2xl font-bold">سجل جلسات الصندوق المغلقة</h2>
          <FilterBar className="mt-4 md:grid-cols-[150px_150px_1fr_120px]">
            <input dir="ltr" lang="en" name="from" type="date" defaultValue={params.from ?? selectedDateKey} className="dashboard-field" />
            <input dir="ltr" lang="en" name="to" type="date" defaultValue={params.to ?? selectedDateKey} className="dashboard-field" />
            <select name="barberId" defaultValue={params.barberId ?? ""} className="dashboard-field">
              <option value="">كل الحلاقين</option>
              {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
            </select>
            <button className="dashboard-button">تصفية</button>
          </FilterBar>

          <TablePanel className="mt-4">
            <table className="dashboard-table min-w-[960px]">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-right">التاريخ</th>
                  <th className="px-3 py-3 text-right">الحلاق</th>
                  <th className="px-3 py-3 text-right">بدأت</th>
                  <th className="px-3 py-3 text-right">أغلقت</th>
                  <th className="px-3 py-3 text-right">الزيارات</th>
                  <th className="px-3 py-3 text-right">الكاش المتوقع</th>
                  <th className="px-3 py-3 text-right">مصروفات الدرج</th>
                  <th className="px-3 py-3 text-right">تحصيلات الإدارة</th>
                  <th className="px-3 py-3 text-right">المعدود عند الإغلاق</th>
                  <th className="px-3 py-3 text-right">الفرق</th>
                  <th className="px-3 py-3 text-right">الشبكة</th>
                  <th className="px-3 py-3 text-right">الصافي</th>
                  <th className="px-3 py-3 text-right">أغلق بواسطة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-salon-line">
                {history.map((close) => (
                  <tr key={close.id}>
                    <td className="px-3 py-3">{close.closedAt ? formatDate(close.closedAt) : "-"}</td>
                    <td className="px-3 py-3">{close.barber.name}</td>
                    <td className="px-3 py-3">{formatDateTime(close.openedAt)}</td>
                    <td className="px-3 py-3">{close.closedAt ? formatDateTime(close.closedAt) : "-"}</td>
                    <td className="px-3 py-3">{close.visitsCount}</td>
                    <td className="px-3 py-3">{formatMoney(close.expectedCash)}</td>
                    <td className="px-3 py-3 text-salon-ruby">{formatMoney(close.expensesTotal)}</td>
                    <td className="px-3 py-3 text-salon-steel">{formatMoney(close.collectionsTotal)}</td>
                    <td className="px-3 py-3">{formatMoney(close.cashReceivedAmount)}</td>
                    <td className="px-3 py-3">{formatMoney(close.cashDifference)}</td>
                    <td className="px-3 py-3">{formatMoney(close.cardTotal)}</td>
                    <td className="px-3 py-3 font-bold">{formatMoney(close.netTotal)}</td>
                    <td className="px-3 py-3">{close.closedBy?.name ?? (close.notes?.includes("أغلقها الحلاق") ? `${close.barber.name} (الحلاق)` : "-")}</td>
                  </tr>
                ))}
                {history.length === 0 ? <tr><td colSpan={13} className="px-4 py-8"><EmptyState title="لا توجد جلسات مغلقة" description="لا يوجد سجل مطابق للفترة أو الحلاق المحدد." /></td></tr> : null}
              </tbody>
            </table>
          </TablePanel>
        </section>
    </DashboardShell>
  );
}
