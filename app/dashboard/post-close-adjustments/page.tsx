import { redirect } from "next/navigation";
import { DashboardShell, EmptyState, FilterBar, StatCard, TablePanel } from "@/components/dashboard/ui";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getPostCloseAdjustmentReport } from "@/lib/post-close-adjustments/post-close-adjustment-report";

export default async function PostCloseAdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; barberId?: string; adjustmentType?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const params = await searchParams;
  const [barbers, report] = await Promise.all([
    prisma.barber.findMany({ orderBy: { name: "asc" } }),
    getPostCloseAdjustmentReport(prisma, {
      from: params.from,
      to: params.to,
      barberId: params.barberId,
      adjustmentType: parseAdjustmentType(params.adjustmentType),
    }),
  ]);

  return (
    <DashboardShell title="تصحيحات ما بعد الإغلاق" description="سجل رقابي لكل تعديل يحدث بعد إغلاق جلسات الصندوق، مع الأثر المالي وأثر النقاط.">
        <FilterBar className="md:grid-cols-[150px_150px_1fr_220px_120px]">
          <input name="from" type="date" defaultValue={params.from ?? ""} className="dashboard-field" />
          <input name="to" type="date" defaultValue={params.to ?? ""} className="dashboard-field" />
          <select name="barberId" defaultValue={params.barberId ?? ""} className="dashboard-field">
            <option value="">كل الحلاقين</option>
            {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
          </select>
          <select name="adjustmentType" defaultValue={params.adjustmentType ?? ""} className="dashboard-field">
            <option value="">كل التصحيحات</option>
            <option value="VISIT_CANCELLED">إلغاء زيارة</option>
            <option value="VISIT_PAYMENT_METHOD_UPDATED">تعديل طريقة الدفع</option>
            <option value="VISIT_AMOUNT_UPDATED">تعديل مبلغ</option>
          </select>
          <button className="dashboard-button">تصفية</button>
        </FilterBar>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="عدد التصحيحات" value={report.summary.count.toString()} />
          <StatCard label="فرق الكاش" value={formatMoney(report.summary.cashDelta)} />
          <StatCard label="فرق الشبكة" value={formatMoney(report.summary.cardDelta)} />
          <StatCard label="فرق الصافي" value={formatMoney(report.summary.netDelta)} />
          <StatCard label="فرق النقاط" value={report.summary.pointsDelta.toString()} />
        </div>

        <TablePanel>
          <table className="dashboard-table min-w-[1320px]">
            <thead>
              <tr>
                <th className="px-3 py-3 text-right">وقت التصحيح</th>
                <th className="px-3 py-3 text-right">النوع</th>
                <th className="px-3 py-3 text-right">الزيارة</th>
                <th className="px-3 py-3 text-right">الحلاق</th>
                <th className="px-3 py-3 text-right">العميل</th>
                <th className="px-3 py-3 text-right">السبب</th>
                <th className="px-3 py-3 text-right">المستخدم</th>
                <th className="px-3 py-3 text-right">الأثر المالي</th>
                <th className="px-3 py-3 text-right">أثر النقاط</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-salon-line">
              {report.adjustments.map((adjustment) => (
                <tr key={adjustment.id}>
                  <td className="px-3 py-3">{new Date(adjustment.createdAt).toLocaleString("ar-SA")}</td>
                  <td className="px-3 py-3">{typeLabel(adjustment.type)}</td>
                  <td className="px-3 py-3">{new Date(adjustment.visitDate).toLocaleString("ar-SA")}<br /><span className="text-xs text-salon-charcoal">{adjustment.visitId}</span></td>
                  <td className="px-3 py-3">{adjustment.barberName}</td>
                  <td className="px-3 py-3">{adjustment.customerName}<br /><span className="text-salon-charcoal">{adjustment.customerPhone}</span></td>
                  <td className="px-3 py-3">{adjustment.reason || "-"}</td>
                  <td className="px-3 py-3">{adjustment.actorName}</td>
                  <td className="px-3 py-3">
                    صافي: {formatMoney(adjustment.financialImpact.netDelta)}<br />
                    كاش: {formatMoney(adjustment.financialImpact.cashDelta)}<br />
                    شبكة: {formatMoney(adjustment.financialImpact.cardDelta)}
                  </td>
                  <td className="px-3 py-3">
                    مكتسبة: {adjustment.pointsImpact.earnedPointsDelta}<br />
                    مستعادة: {adjustment.pointsImpact.redeemedPointsDelta}<br />
                    النهائي: {adjustment.pointsImpact.finalBalanceChange}
                  </td>
                </tr>
              ))}
              {report.adjustments.length === 0 ? <tr><td colSpan={9} className="px-4 py-8"><EmptyState title="لا توجد تصحيحات بعد الإغلاق" description="الوضع مستقر ولا يوجد سجل مطابق للفلاتر الحالية." /></td></tr> : null}
            </tbody>
          </table>
        </TablePanel>
    </DashboardShell>
  );
}

function parseAdjustmentType(value: string | undefined) {
  if (value === "VISIT_CANCELLED" || value === "VISIT_PAYMENT_METHOD_UPDATED" || value === "VISIT_AMOUNT_UPDATED") return value;
  return undefined;
}

function typeLabel(type: string) {
  if (type === "VISIT_CANCELLED") return "إلغاء زيارة";
  if (type === "VISIT_PAYMENT_METHOD_UPDATED") return "تعديل طريقة الدفع";
  if (type === "VISIT_AMOUNT_UPDATED") return "تعديل مبلغ";
  return type;
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ريال`;
}
