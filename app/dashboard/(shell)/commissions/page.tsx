import { redirect } from "next/navigation";
import { formatMoney, formatNumber } from "@/lib/format";
import { DashboardShell, EmptyState, Field, FilterBar, Notice, StatCard, TablePanel } from "@/components/dashboard/ui";
import { canAccessDashboard } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getCommissionReport } from "@/lib/commissions/commission-report";

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; barberId?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const params = await searchParams;
  const { organizationId, orgWhere, salonWhere, salonIds } = dashboardScope(session);

  const [report, barbers] = await Promise.all([
    getCommissionReport(prisma, {
      organizationId,
      salonIds,
      from: params.from,
      to: params.to,
      barberId: params.barberId,
    }),
    prisma.barber.findMany({ where: { ...orgWhere, ...salonWhere }, orderBy: { name: "asc" } }),
  ]);

  const hasRates = report.rows.some((row) => row.commissionAmount > 0);

  return (
    <DashboardShell
      title="مستحقات العمولات"
      description="عمولة كل حلاق عن الفترة، محسوبة على المبلغ بعد الخصم كما كانت وقت كل زيارة."
    >
      <FilterBar className="md:grid-cols-[160px_160px_1fr_120px]">
        <Field label="من تاريخ"><input dir="ltr" lang="en" name="from" type="date" defaultValue={params.from ?? ""} className="dashboard-field" /></Field>
        <Field label="إلى تاريخ"><input dir="ltr" lang="en" name="to" type="date" defaultValue={params.to ?? ""} className="dashboard-field" /></Field>
        <Field label="الحلاق"><select name="barberId" defaultValue={params.barberId ?? ""} className="dashboard-field">
          <option value="">كل الحلاقين</option>
          {barbers.map((barber) => (
            <option key={barber.id} value={barber.id}>
              {barber.name}
            </option>
          ))}
        </select></Field>
        <button className="dashboard-button">تصفية</button>
      </FilterBar>

      {!hasRates ? (
        <Notice tone="info" className="mt-6" title="لم تُضبط نسب العمولة بعد">
          حدّد نسبة لكل حلاق من صفحة الحلاقين، أو نسبة افتراضية للفرع من الإعدادات. الزيارات المسجّلة قبل ضبط النسبة
          تبقى بعمولة صفر — العمولة تُثبَّت وقت الزيارة ولا تُحتسب رجعيًا.
        </Notice>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="إجمالي المستحقات" value={formatMoney(report.totals.commissionAmount)} />
        <StatCard label="وعاء العمولة" value={formatMoney(report.totals.commissionBase)} />
        <StatCard label="عدد الزيارات" value={formatNumber(report.totals.visitsCount)} />
        <StatCard label="حلاقون بمستحقات" value={formatNumber(report.totals.barbersCount)} />
      </div>

      <TablePanel>
        <table className="dashboard-table min-w-[900px]">
          <thead>
            <tr>
              <th>الحلاق</th>
              <th>الفرع</th>
              <th>الزيارات</th>
              <th>وعاء العمولة</th>
              <th>النسبة الفعلية</th>
              <th>المستحق</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.barberId}>
                <td className="px-4 py-3 font-bold">{row.barberName}</td>
                <td className="px-4 py-3">{row.salonName || "-"}</td>
                <td className="px-4 py-3 tabular-nums">{formatNumber(row.visitsCount)}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(row.commissionBase)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {row.effectiveRate}%
                  {row.appliedRates.length > 1 ? (
                    <span className="mr-2 text-xs font-semibold text-salon-charcoal/70">
                      (نسب مختلفة: {row.appliedRates.join("، ")}%)
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 font-black tabular-nums text-salon-forest">{formatMoney(row.commissionAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="لا توجد زيارات في هذه الفترة" description="غيّر الفترة أو الحلاق لعرض المستحقات." />
          </div>
        ) : null}
      </TablePanel>
    </DashboardShell>
  );
}
