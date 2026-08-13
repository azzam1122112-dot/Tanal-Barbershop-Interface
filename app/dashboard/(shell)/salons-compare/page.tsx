import { redirect } from "next/navigation";
import { formatDate, formatMoney, formatNumber, formatReportPeriod } from "@/lib/format";
import { DashboardShell, EmptyState, Field, FilterBar, Notice, ReportPrintMeta, StatCard, TablePanel } from "@/components/dashboard/ui";
import { PrintButton } from "@/components/ui/print-button";
import { canAccessDashboard, canViewFinancials } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getSalonComparisonReport } from "@/lib/reports/salon-comparison";

export default async function SalonComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (session.type !== "dashboard") redirect("/dashboard");
  // الصفحة تعرض «المتبقي للمؤسسة» لكل فرع — نفس رقم البيان المالي، فتلزمها نفس
  // البوابة. إخفاؤها من التنقّل وحده لم يكن صلاحية: الرابط المباشر كان يفتحها.
  if (!canViewFinancials(session)) redirect("/dashboard/forbidden");

  const params = await searchParams;
  const { organizationId, salonIds } = dashboardScope(session);
  if (!organizationId) redirect("/dashboard");

  const report = await getSalonComparisonReport(prisma, {
    organizationId,
    // المشرف يقارن فروعه المسندة فقط؛ المالك يقارن كل الفروع.
    salonIds,
    from: params.from,
    to: params.to,
  });

  return (
    <DashboardShell
      title="مقارنة الفروع"
      description="أداء الفروع جنبًا إلى جنب: الدخل، متوسط الفاتورة، العمولات، المصروفات، وما يتبقى للمؤسسة."
      actions={<PrintButton label="طباعة المقارنة" />}
    >
      <ReportPrintMeta period={formatReportPeriod(report.from, report.to)} printedAt={formatDate(new Date())} />

      <FilterBar className="md:grid-cols-[160px_160px_1fr_120px]">
        <Field label="من تاريخ"><input dir="ltr" lang="en" name="from" type="date" defaultValue={params.from ?? ""} className="dashboard-field" /></Field>
        <Field label="إلى تاريخ"><input dir="ltr" lang="en" name="to" type="date" defaultValue={params.to ?? ""} className="dashboard-field" /></Field>
        <span />
        <button className="dashboard-button">تصفية</button>
      </FilterBar>

      {report.rows.length < 2 ? (
        <Notice tone="info" className="mt-6" title="المقارنة تحتاج فرعين على الأقل">
          أضف فرعًا آخر من صفحة الفروع لتظهر المقارنة بمعناها.
        </Notice>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="دخل الفترة" value={formatMoney(report.totals.netAmount)} />
        <StatCard label="عمولات الحلاقين" value={formatMoney(report.totals.commissionAmount)} />
        <StatCard label="مصروفات نثرية" value={formatMoney(report.totals.expensesTotal)} />
        <StatCard
          label="المتبقي للمؤسسة"
          value={formatMoney(report.totals.contribution)}
          subValue="بعد العمولات والمصروفات"
        />
      </div>

      {report.best && report.weakest ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-green-900">
            <p className="text-sm font-bold">الأعلى دخلًا</p>
            <p className="mt-1 text-lg font-bold">{report.best.salonName}</p>
            <p className="mt-1 text-sm font-semibold">
              {formatMoney(report.best.netAmount)} · {report.best.share}% من الدخل
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
            <p className="text-sm font-bold">الأقل دخلًا</p>
            <p className="mt-1 text-lg font-bold">{report.weakest.salonName}</p>
            <p className="mt-1 text-sm font-semibold">
              {formatMoney(report.weakest.netAmount)} · {report.weakest.share}% من الدخل
            </p>
          </div>
        </div>
      ) : null}

      <TablePanel>
        <table className="dashboard-table min-w-[1180px]">
          <thead>
            <tr>
              <th>#</th>
              <th>الفرع</th>
              <th>الزيارات</th>
              <th>الدخل</th>
              <th>الحصة</th>
              <th>متوسط الفاتورة</th>
              <th>متوسط يومي</th>
              <th>العمولات</th>
              <th>المصروفات</th>
              <th>المتبقي</th>
              <th>حلاقون</th>
              <th>عملاء</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.salonId}>
                <td className="px-4 py-3 tabular-nums">{row.rank}</td>
                <td className="px-4 py-3 font-bold">
                  {row.salonName}
                  {!row.isActive ? <span className="mr-2 text-xs font-semibold text-salon-ruby">معطل</span> : null}
                </td>
                <td className="px-4 py-3 tabular-nums">{formatNumber(row.visitsCount)}</td>
                <td className="px-4 py-3 font-black tabular-nums text-salon-forest">{formatMoney(row.netAmount)}</td>
                <td className="px-4 py-3 tabular-nums">{row.share}%</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(row.averageTicket)}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(row.dailyAverage)}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(row.commissionAmount)}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(row.expensesTotal)}</td>
                <td className="px-4 py-3 font-bold tabular-nums">{formatMoney(row.contribution)}</td>
                <td className="px-4 py-3 tabular-nums">{formatNumber(row.activeBarbers)}</td>
                <td className="px-4 py-3 tabular-nums">{formatNumber(row.uniqueCustomers)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="لا توجد فروع لعرضها" />
          </div>
        ) : null}
      </TablePanel>
    </DashboardShell>
  );
}
