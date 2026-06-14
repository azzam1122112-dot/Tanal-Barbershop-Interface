import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell, EmptyState, FilterBar, TablePanel } from "@/components/dashboard/ui";
import { DailyCloseManager } from "@/components/dashboard/daily-close-manager";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { getCashSessionHistory, getCashSessionSummary } from "@/lib/cash-sessions/cash-session-service";
import { prisma } from "@/lib/db/prisma";
import { getPostCloseAdjustmentReport } from "@/lib/post-close-adjustments/post-close-adjustment-report";

export default async function DashboardDailyClosePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; to?: string; barberId?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const params = await searchParams;
  const selectedDate = params.date ? new Date(params.date) : new Date();
  const last7From = new Date(selectedDate);
  last7From.setDate(last7From.getDate() - 6);
  const [summary, history, barbers, adjustmentReport] = await Promise.all([
    getCashSessionSummary(prisma),
    getCashSessionHistory(prisma, { from: params.from ?? selectedDate, to: params.to ?? selectedDate, barberId: params.barberId }),
    prisma.barber.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    getPostCloseAdjustmentReport(prisma, { from: last7From, to: selectedDate }),
  ]);

  return (
    <DashboardShell title="جلسات الصندوق" description="الجلسات ليست مرتبطة بتاريخ أو جدول دوام. يفتح الحلاق جلسة، ويغلقها المدير عند استلام الكاش.">
        <form className="dashboard-panel mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <label className="text-sm font-bold text-salon-charcoal">
            تاريخ سجل الجلسات
            <input name="date" type="date" defaultValue={toDateInput(selectedDate)} className="dashboard-field mt-2" />
          </label>
          <button className="dashboard-button">عرض السجل</button>
        </form>

        <DailyCloseManager initialSummary={summary} />

        <Link href="/dashboard/post-close-adjustments" className="dashboard-panel mt-6 block p-5 font-black transition hover:border-salon-gold">
          تصحيحات بعد الإغلاق
          <span className="mt-2 block text-sm font-normal text-salon-charcoal">
            {adjustmentReport.summary.count > 0
              ? `يوجد ${adjustmentReport.summary.count} تصحيحات تمت بعد إغلاق جلسات الصندوق خلال آخر 7 أيام`
              : "لا توجد تصحيحات بعد الإغلاق خلال آخر 7 أيام"}
          </span>
        </Link>

        <section className="mt-8">
          <h2 className="text-2xl font-black">سجل جلسات الصندوق المغلقة</h2>
          <FilterBar className="mt-4 md:grid-cols-[150px_150px_1fr_120px]">
            <input name="from" type="date" defaultValue={params.from ?? toDateInput(selectedDate)} className="dashboard-field" />
            <input name="to" type="date" defaultValue={params.to ?? toDateInput(selectedDate)} className="dashboard-field" />
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
                  <th className="px-3 py-3 text-right">المستلم</th>
                  <th className="px-3 py-3 text-right">الفرق</th>
                  <th className="px-3 py-3 text-right">الشبكة</th>
                  <th className="px-3 py-3 text-right">الصافي</th>
                  <th className="px-3 py-3 text-right">استلم بواسطة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-salon-line">
                {history.map((close) => (
                  <tr key={close.id}>
                    <td className="px-3 py-3">{close.closedAt ? new Date(close.closedAt).toLocaleDateString("ar-SA") : "-"}</td>
                    <td className="px-3 py-3">{close.barber.name}</td>
                    <td className="px-3 py-3">{new Date(close.openedAt).toLocaleString("ar-SA")}</td>
                    <td className="px-3 py-3">{close.closedAt ? new Date(close.closedAt).toLocaleString("ar-SA") : "-"}</td>
                    <td className="px-3 py-3">{close.visitsCount}</td>
                    <td className="px-3 py-3">{formatMoney(close.cashTotal)}</td>
                    <td className="px-3 py-3">{formatMoney(close.cashReceivedAmount)}</td>
                    <td className="px-3 py-3">{formatMoney(close.cashDifference)}</td>
                    <td className="px-3 py-3">{formatMoney(close.cardTotal)}</td>
                    <td className="px-3 py-3 font-bold">{formatMoney(close.netTotal)}</td>
                    <td className="px-3 py-3">{close.closedBy?.name ?? "-"}</td>
                  </tr>
                ))}
                {history.length === 0 ? <tr><td colSpan={11} className="px-4 py-8"><EmptyState title="لا توجد جلسات مغلقة" description="لا يوجد سجل مطابق للفترة أو الحلاق المحدد." /></td></tr> : null}
              </tbody>
            </table>
          </TablePanel>
        </section>
    </DashboardShell>
  );
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ريال`;
}
