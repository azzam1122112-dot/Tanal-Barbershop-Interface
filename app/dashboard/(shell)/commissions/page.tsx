import { redirect } from "next/navigation";
import { formatDate, formatMoney, formatNumber, formatReportPeriod } from "@/lib/format";
import { DashboardShell, EmptyState, Field, FilterBar, Notice, ReportPrintMeta, StatCard, TablePanel } from "@/components/dashboard/ui";
import { PrintButton } from "@/components/ui/print-button";
import { canAccessDashboard, canPayCommissions } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getCommissionReport } from "@/lib/commissions/commission-report";
import { getCommissionLedger, listCommissionPayouts } from "@/lib/commissions/commission-payout";
import { CommissionPayoutManager } from "@/components/dashboard/commission-payout-manager";

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

  const canPay = canPayCommissions(session);
  const [report, barbers, ledger, payouts] = await Promise.all([
    getCommissionReport(prisma, {
      organizationId,
      salonIds,
      from: params.from,
      to: params.to,
      barberId: params.barberId,
    }),
    prisma.barber.findMany({ where: { ...orgWhere, ...salonWhere }, orderBy: { name: "asc" } }),
    // الدفتر تراكمي عبر كل الفترات والفروع عمدًا: الصرف يتم من الرصيد الجاري لا
    // من مستحق الفترة المعروضة، وإلا صُرف مرتين عن نفس الزيارة بتغيير التاريخ.
    // ولأنه يتجاوز حدود الفرع فهو محجوب عن المشرف: يرى مستحق فروعه في الجدول
    // أعلاه، أما دَين المؤسسة تجاه الحلاق فبيد من يملك صرفه.
    organizationId && canPay
      ? getCommissionLedger(prisma, { organizationId, salonIds, barberId: params.barberId })
      : Promise.resolve([]),
    organizationId && canPay
      ? listCommissionPayouts(prisma, { organizationId, salonIds, barberId: params.barberId })
      : Promise.resolve([]),
  ]);

  const hasRates = report.rows.some((row) => row.commissionAmount > 0);

  return (
    <DashboardShell
      title="مستحقات العمولات وصرفها"
      description="عمولة كل حلاق عن الفترة محسوبة كما كانت وقت كل زيارة، ودفتر جارٍ لما صُرف وما تبقى."
      actions={<PrintButton label="طباعة المستحقات" />}
    >
      <ReportPrintMeta period={formatReportPeriod(report.from, report.to)} printedAt={formatDate(new Date())} />

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
        <StatCard
          label="حلاقون بمستحقات"
          value={formatNumber(report.totals.earningBarbersCount)}
          subValue={
            report.totals.barbersCount > report.totals.earningBarbersCount
              ? `${formatNumber(report.totals.barbersCount - report.totals.earningBarbersCount)} بلا نسبة عمولة`
              : undefined
          }
        />
      </div>

      <TablePanel label="مستحقات عمولات الحلاقين">
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

      {canPay ? (
        <>
          <div className="mt-8">
            <h2 className="lux-section-title">الصرف والمتبقي</h2>
            <p className="dashboard-muted mt-1 max-w-2xl text-sm leading-6">
              الأرقام هنا تراكمية منذ أول زيارة وعبر كل الفروع، ولا تتأثر بفلتر الفترة أعلاه. الصرف
              حركة نقد لا مصروف جديد: ربح المؤسسة خُصمت منه العمولة مرة واحدة وقت الزيارة.
            </p>
          </div>

          <CommissionPayoutManager
            ledger={ledger}
            payouts={payouts}
            canPay
            periodFrom={report.from}
            periodTo={report.to}
          />
        </>
      ) : (
        <Notice tone="info" className="mt-8" title="الصرف والمتبقي من صلاحيات المالك أو مدير المؤسسة">
          الجدول أعلاه يعرض مستحق فروعك عن الفترة المختارة. أما دفتر الصرف فتراكمي عبر كل الفروع —
          يشمل عمل الحلاق قبل نقله إلى فرعك — فيبقى مع من يملك قرار الصرف.
        </Notice>
      )}
    </DashboardShell>
  );
}
