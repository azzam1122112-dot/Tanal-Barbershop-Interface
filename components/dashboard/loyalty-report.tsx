import { formatNumber } from "@/lib/format";
import { SectionPanel, StatCard, TablePanel } from "@/components/dashboard/ui";
import type { LoyaltyProgramReport } from "@/lib/reports/loyalty-report";

/**
 * تقرير برنامج الولاء بمستويين مفصولين بصريًا لا بالعنوان وحده.
 *
 * **لماذا الفصل ظاهر:** فلتر الفرع يغيّر أرقام النشاط ولا يمسّ أرقام البرنامج.
 * لو عُرض الصفّان متجاورين بلا فاصل لقرأ المالك «الرصيد القائم» تحت عنوان فرع
 * جدة فظنّ أن لجدة محفظة. التسمية هنا تقول صراحةً أيّ رقم يتحرك بالفلتر وأيّه لا.
 */
export function LoyaltyProgramReportPanel({
  report,
  scopeLabel,
}: {
  report: LoyaltyProgramReport;
  scopeLabel: string;
}) {
  return (
    <SectionPanel title="أداء برنامج الولاء هذا الشهر" className="mt-6">
      <div className="space-y-6 p-5">
        <div>
          <p className="lux-eyebrow text-salon-charcoal/60">البرنامج — على مستوى المؤسسة دائمًا</p>
          <p className="dashboard-muted mt-1 text-sm leading-6">
            هذه الأرقام لا تتغيّر بفلتر الفرع: العضوية والرصيد وعاء واحد للمؤسسة، ولا يوجد رصيد لفرع.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="أعضاء الولاء" value={formatNumber(report.program.members)} />
            <StatCard label="الرصيد القائم" value={`${formatNumber(report.program.outstandingPoints)} نقطة`} tone="gold" />
            <StatCard label="إجمالي ما كُسب تاريخيًا" value={`${formatNumber(report.program.lifetimeEarned)} نقطة`} />
            <StatCard label="إجمالي ما استُبدل تاريخيًا" value={`${formatNumber(report.program.lifetimeRedeemed)} نقطة`} />
          </div>
        </div>

        <div>
          <p className="lux-eyebrow text-salon-charcoal/60">النشاط — {scopeLabel}</p>
          <p className="dashboard-muted mt-1 text-sm leading-6">
            حركات وقعت خلال الشهر في نطاق العرض الحالي. تحليلية بحتة: تغيير الفرع يغيّر ما يُقاس لا ما يملكه العميل.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="نقاط مكتسبة" value={formatNumber(report.activity.pointsEarned)} subValue={`${formatNumber(report.activity.earnCount)} عملية`} tone="success" />
            <StatCard label="نقاط مستبدلة" value={formatNumber(report.activity.pointsRedeemed)} subValue={`${formatNumber(report.activity.redeemCount)} عملية`} />
            <StatCard label="زيارات مرتبطة بالولاء" value={formatNumber(report.activity.loyaltyVisits)} subValue={`متوسط ${formatNumber(report.activity.averageEarnPerVisit)} نقطة للزيارة`} />
            <StatCard
              label="صافي حركة النقاط"
              value={formatNumber(report.activity.netPoints)}
              subValue={`${formatNumber(report.activity.reversalCount + report.activity.adjustmentCount)} عكس وتسوية`}
              hint="المكتسب ناقص المستبدل، مضافًا إليه العكوسات والتسويات."
            />
          </div>
        </div>
      </div>

      <TablePanel className="mt-0 rounded-none border-x-0 border-b-0">
        <table className="dashboard-table min-w-[560px]">
          <thead>
            <tr>
              <th>الفرع</th>
              <th>نقاط مُصدرة</th>
              <th>عمليات كسب</th>
              <th>نقاط مستبدلة</th>
              <th>عمليات استبدال</th>
            </tr>
          </thead>
          <tbody>
            {report.branches.length === 0 ? (
              <tr>
                <td colSpan={5} className="dashboard-muted text-center">لا حركة نقاط في هذه الفترة</td>
              </tr>
            ) : (
              report.branches.map((branch) => (
                <tr key={branch.salonId ?? "unassigned"}>
                  <td className="font-semibold text-salon-ink">{branch.name}</td>
                  <td className="lux-number">{formatNumber(branch.pointsEarned)}</td>
                  <td>{formatNumber(branch.earnCount)}</td>
                  <td className="lux-number">{formatNumber(branch.pointsRedeemed)}</td>
                  <td>{formatNumber(branch.redeemCount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TablePanel>

      <TablePanel className="mt-0 rounded-none border-x-0 border-b-0">
        <table className="dashboard-table min-w-[560px]">
          <thead>
            <tr>
              <th>أفضل العملاء</th>
              <th>الجوال</th>
              <th>نقاط كسبها في الفترة</th>
              <th>زيارات</th>
              <th>رصيده الحالي بالمؤسسة</th>
            </tr>
          </thead>
          <tbody>
            {report.topCustomers.length === 0 ? (
              <tr>
                <td colSpan={5} className="dashboard-muted text-center">لا نشاط عملاء في هذه الفترة</td>
              </tr>
            ) : (
              report.topCustomers.map((customer) => (
                <tr key={customer.customerId}>
                  <td className="font-semibold text-salon-ink">{customer.name}</td>
                  <td dir="ltr" className="text-right">{customer.phone}</td>
                  <td className="lux-number">{formatNumber(customer.pointsEarned)}</td>
                  <td>{formatNumber(customer.earnCount)}</td>
                  <td className="lux-number">{formatNumber(customer.currentBalance)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TablePanel>
    </SectionPanel>
  );
}
