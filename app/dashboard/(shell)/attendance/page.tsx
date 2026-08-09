import { redirect } from "next/navigation";
import { formatDateTime, formatNumber } from "@/lib/format";
import { DashboardShell, EmptyState, Field, FilterBar, StatCard, TablePanel } from "@/components/dashboard/ui";
import { canAccessDashboard } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getAttendanceReport } from "@/lib/attendance/attendance-service";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; barberId?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (session.type !== "dashboard") redirect("/dashboard");

  const params = await searchParams;
  const { organizationId, orgWhere, salonWhere, salonIds } = dashboardScope(session);
  if (!organizationId) redirect("/dashboard");

  const [report, barbers] = await Promise.all([
    getAttendanceReport(prisma, {
      organizationId,
      salonIds,
      from: params.from,
      to: params.to,
      barberId: params.barberId,
    }),
    prisma.barber.findMany({ where: { ...orgWhere, ...salonWhere }, orderBy: { name: "asc" } }),
  ]);

  const openShifts = report.summary.reduce((total, row) => total + row.openShifts, 0);

  return (
    <DashboardShell
      title="الحضور والانصراف"
      description="سجل دوام الحلاقين. مستقل عن جلسة الصندوق: الجلسة أداة مالية والحضور أداة إدارية."
    >
      <FilterBar className="md:grid-cols-[160px_160px_1fr_120px]">
        <Field label="من تاريخ"><input lang="en" name="from" type="date" defaultValue={params.from ?? ""} className="dashboard-field" /></Field>
        <Field label="إلى تاريخ"><input lang="en" name="to" type="date" defaultValue={params.to ?? ""} className="dashboard-field" /></Field>
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

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="حلاقون داوموا" value={formatNumber(report.summary.length)} />
        <StatCard label="إجمالي أيام الدوام" value={formatNumber(report.summary.reduce((total, row) => total + row.days, 0))} />
        <StatCard
          label="إجمالي الساعات"
          value={formatNumber(Math.round(report.summary.reduce((total, row) => total + row.hours, 0)))}
        />
        <StatCard label="دوام مفتوح الآن" value={formatNumber(openShifts)} subValue={openShifts > 0 ? "لم يسجّل انصرافًا" : undefined} />
      </div>

      <TablePanel>
        <table className="dashboard-table min-w-[760px]">
          <thead>
            <tr>
              <th>الحلاق</th>
              <th>أيام الدوام</th>
              <th>إجمالي الساعات</th>
              <th>متوسط اليوم</th>
              <th>دوام مفتوح</th>
            </tr>
          </thead>
          <tbody>
            {report.summary.map((row) => (
              <tr key={row.barberId}>
                <td className="px-4 py-3 font-bold">{row.barberName}</td>
                <td className="px-4 py-3 tabular-nums">{formatNumber(row.days)}</td>
                <td className="px-4 py-3 tabular-nums">{row.hours} ساعة</td>
                <td className="px-4 py-3 tabular-nums">{row.averageHoursPerDay} ساعة</td>
                <td className="px-4 py-3 tabular-nums">{row.openShifts > 0 ? "نعم" : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.summary.length === 0 ? (
          <div className="p-6">
            <EmptyState title="لا توجد سجلات دوام في هذه الفترة" />
          </div>
        ) : null}
      </TablePanel>

      <TablePanel>
        <table className="dashboard-table min-w-[860px]">
          <thead>
            <tr>
              <th>الحلاق</th>
              <th>الفرع</th>
              <th>الحضور</th>
              <th>الانصراف</th>
              <th>المدة</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-bold">{row.barberName}</td>
                <td className="px-4 py-3">{row.salonName}</td>
                <td className="px-4 py-3">{formatDateTime(row.checkInAt)}</td>
                <td className="px-4 py-3">{row.checkOutAt ? formatDateTime(row.checkOutAt) : "ما زال داخل الدوام"}</td>
                <td className="px-4 py-3 tabular-nums">
                  {row.isOpen ? "-" : `${Math.floor(row.minutes / 60)}س ${row.minutes % 60}د`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablePanel>
    </DashboardShell>
  );
}
