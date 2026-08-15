import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, DashboardShell, Field, FilterBar, InlineEmpty, Notice, ReportPrintMeta, SectionPanel, StatCard, TablePanel } from "@/components/dashboard/ui";
import { PrintButton } from "@/components/ui/print-button";
import { canViewFinancials } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { addRiyadhMonths, toRiyadhMonthKey } from "@/lib/datetime/riyadh";
import { prisma } from "@/lib/db/prisma";
import { getCommissionMovement } from "@/lib/finance/commission-movement";
import { getFinancialPeriodReport, MAX_FINANCIAL_MONTHS, resolveMonthSpan } from "@/lib/finance/financial-period";
import { formatDate, formatMoney, formatMonthLabel, formatNumber, formatPercent } from "@/lib/format";

/**
 * البيان المالي الشهري.
 *
 * الشاشات التشغيلية (الجلسات، الزيارات، الإغلاق) تبقى يومية عمدًا — اليومي أداة
 * تشغيل تُطابق درجًا وتُقفل وردية. هذه الشاشة أداة ملكية: وحدتها الشهر، وسؤالها
 * «كم بقي لي بعد أن دفعت فريقي ومصروفاتي، وهل الاتجاه صاعد أم هابط».
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canViewFinancials(session)) redirect("/dashboard/forbidden");

  const { organizationId, salonIds, isAggregate } = dashboardScope(session);
  if (!organizationId) redirect("/dashboard");

  const params = await searchParams;
  const now = new Date();
  const requested = resolvePreset(params, now);
  const span = resolveMonthSpan(requested.from, requested.to, now);

  const scope = { organizationId, salonIds, fromKey: span.fromKey, toKey: span.toKey, now };
  const [report, commissions] = await Promise.all([
    getFinancialPeriodReport(prisma, scope),
    getCommissionMovement(prisma, scope),
  ]);

  const { totals } = report;
  // عمود التكلفة يظهر لمن يبيع منتجات فقط — صالون خدمات بحتة لا يحتاج عمودًا بصفر.
  const hasProducts = totals.productSales > 0;
  const isSingleMonth = report.months.length === 1;
  const heading = isSingleMonth
    ? formatMonthLabel(report.fromKey)
    : `${formatMonthLabel(report.fromKey)} — ${formatMonthLabel(report.toKey)}`;

  return (
    <DashboardShell
      title="البيان المالي الشهري"
      description="الدخل والعمولات والمصروفات والمتبقي للمؤسسة، شهرًا بشهر. اختر شهرًا واحدًا أو عدة أشهر."
      actions={<PrintButton label="طباعة البيان" />}
    >
      <ReportPrintMeta period={heading} printedAt={formatDate(new Date())} />

      <FilterBar className="lg:grid-cols-[200px_170px_170px_1fr_120px]">
        <Field label="مدى جاهز">
          <select name="preset" defaultValue={requested.preset} className="dashboard-field">
            <option value="current">هذا الشهر</option>
            <option value="previous">الشهر الماضي</option>
            <option value="last3">آخر 3 أشهر</option>
            <option value="last6">آخر 6 أشهر</option>
            <option value="last12">آخر 12 شهرًا</option>
            <option value="custom">مدى مخصص</option>
          </select>
        </Field>
        <Field label="من شهر" hint="اتركه على «مدى جاهز» أو اختر «مدى مخصص»">
          <input dir="ltr" lang="en" name="from" type="month" defaultValue={span.fromKey} className="dashboard-field" />
        </Field>
        <Field label="إلى شهر">
          <input dir="ltr" lang="en" name="to" type="month" defaultValue={span.toKey} className="dashboard-field" />
        </Field>
        <div />
        <button className="dashboard-button">تطبيق</button>
      </FilterBar>

      <p className="dashboard-muted mt-3 text-sm font-semibold">
        {heading} · {isAggregate ? "كل الفروع ضمن نطاقك" : "الفرع النشط فقط"}
        {report.monthsCount > 1 ? ` · ${formatNumber(report.monthsCount)} أشهر` : ""}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="صافي المبيعات" value={formatMoney(totals.netSales)} subValue={`${formatNumber(totals.visitsCount)} زيارة مكتملة`} />
        <StatCard label="عمولات مستحقة" value={formatMoney(totals.commissionAccrued)} subValue="عن زيارات المدة، لا ما صُرف" />
        <StatCard label="المصروفات" value={formatMoney(totals.expensesTotal)} subValue={`${formatNumber(totals.expensesCount)} حركة`} tone={totals.expensesTotal > 0 ? "danger" : "neutral"} />
        <StatCard
          label="المتبقي للمؤسسة"
          value={formatMoney(totals.contribution)}
          subValue={`هامش ${formatPercent(totals.contributionMargin, 1)} من صافي المبيعات`}
          tone={totals.contribution >= 0 ? "gold" : "danger"}
          hint="صافي المبيعات − تكلفة المنتجات المباعة − عمولات الحلاقين المستحقة − المصروفات"
        />
      </div>

      {totals.productSales > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="مبيعات المنتجات" value={formatMoney(totals.productSales)} subValue="ضمن صافي المبيعات أعلاه" />
          <StatCard label="تكلفة المنتجات المباعة" value={formatMoney(totals.productCost)} subValue="بتكلفة لحظة البيع" tone={totals.productCost > 0 ? "danger" : "neutral"} />
          <StatCard label="مجمل الربح" value={formatMoney(totals.grossProfit)} subValue="صافي المبيعات − تكلفة المنتجات" />
          <StatCard
            label="هامش المنتجات"
            value={totals.productSales > 0 ? formatPercent(((totals.productSales - totals.productCost) / totals.productSales) * 100, 1) : "-"}
            subValue={report.unpricedProductUnits > 0 ? `${formatNumber(report.unpricedProductUnits)} وحدة بلا تكلفة مسجّلة` : "كل الوحدات مسعّرة"}
            tone={report.unpricedProductUnits > 0 ? "danger" : "neutral"}
          />
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="قبل الخصم" value={formatMoney(totals.grossSales)} subValue={`خصومات ${formatMoney(totals.discounts)}`} />
        <StatCard label="كاش / شبكة" value={`${formatMoney(totals.cashSales)}`} subValue={`شبكة ${formatMoney(totals.cardSales)}`} />
        <StatCard label="متوسط الفاتورة" value={formatMoney(totals.averageTicket)} />
        <StatCard
          label={report.monthsCount > 1 ? "متوسط المتبقي شهريًا" : "متوسط الزيارات للشهر"}
          value={report.monthsCount > 1 ? formatMoney(report.monthlyAverage.contribution) : formatNumber(totals.visitsCount)}
          subValue={report.monthsCount > 1 ? `صافي مبيعات ${formatMoney(report.monthlyAverage.netSales)}` : undefined}
        />
      </div>

      <TablePanel>
        <div className="border-b border-salon-line/70 px-5 py-4">
          <h2 className="lux-section-title">قائمة الدخل شهرًا بشهر</h2>
          <p className="dashboard-muted mt-1 text-sm leading-6">
            الأرقام بأساس الاستحقاق: العمولة تُحتسب في شهر الزيارة لا في شهر صرفها، وإلا ظهر شهرٌ
            صُرفت فيه دفعتان خاسرًا وشهرٌ لم يُصرف فيه شيء ممتازًا.
          </p>
        </div>
        <table className="dashboard-table min-w-[1080px]">
          <thead>
            <tr>
              <th>الشهر</th>
              <th>الزيارات</th>
              <th>قبل الخصم</th>
              <th>الخصومات</th>
              <th>صافي المبيعات</th>
              {hasProducts ? <th>تكلفة المنتجات</th> : null}
              <th>العمولات المستحقة</th>
              <th>المصروفات</th>
              <th>المتبقي للمؤسسة</th>
              <th>التغيّر</th>
            </tr>
          </thead>
          <tbody>
            {report.months.map((month, index) => {
              const previous = index > 0 ? report.months[index - 1] : null;
              const change = previous ? percentChange(previous.netSales, month.netSales) : null;
              return (
                <tr key={month.monthKey}>
                  <td className="px-4 py-3 font-bold">{month.monthLabel}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(month.visitsCount)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(month.grossSales)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(month.discounts)}</td>
                  <td className="px-4 py-3 lux-number">{formatMoney(month.netSales)}</td>
                  {hasProducts ? <td className="px-4 py-3 tabular-nums text-salon-ruby">{formatMoney(month.productCost)}</td> : null}
                  <td className="px-4 py-3 tabular-nums">{formatMoney(month.commissionAccrued)}</td>
                  <td className="px-4 py-3 tabular-nums text-salon-ruby">{formatMoney(month.expensesTotal)}</td>
                  <td className={`px-4 py-3 lux-number ${month.contribution >= 0 ? "text-salon-forest" : "text-salon-ruby"}`}>
                    {formatMoney(month.contribution)}
                  </td>
                  <td className="px-4 py-3">
                    {change === null ? (
                      <span className="text-salon-charcoal/60">-</span>
                    ) : (
                      <Badge tone={change >= 0 ? "success" : "danger"}>
                        {change >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(change), 1)}
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-salon-line bg-[#faf8f3]">
              <td className="px-4 py-3 font-black">الإجمالي</td>
              <td className="px-4 py-3 font-bold tabular-nums">{formatNumber(totals.visitsCount)}</td>
              <td className="px-4 py-3 font-bold tabular-nums">{formatMoney(totals.grossSales)}</td>
              <td className="px-4 py-3 font-bold tabular-nums">{formatMoney(totals.discounts)}</td>
              <td className="px-4 py-3 lux-number">{formatMoney(totals.netSales)}</td>
              {hasProducts ? <td className="px-4 py-3 font-bold tabular-nums text-salon-ruby">{formatMoney(totals.productCost)}</td> : null}
              <td className="px-4 py-3 font-bold tabular-nums">{formatMoney(totals.commissionAccrued)}</td>
              <td className="px-4 py-3 font-bold tabular-nums text-salon-ruby">{formatMoney(totals.expensesTotal)}</td>
              <td className={`px-4 py-3 lux-number ${totals.contribution >= 0 ? "text-salon-forest" : "text-salon-ruby"}`}>
                {formatMoney(totals.contribution)}
              </td>
              <td className="px-4 py-3" />
            </tr>
          </tfoot>
        </table>
      </TablePanel>

      <TablePanel>
        <div className="border-b border-salon-line/70 px-5 py-4">
          <h2 className="lux-section-title">الحركة النقدية للعمولات</h2>
          <p className="dashboard-muted mt-1 text-sm leading-6">
            بيان منفصل عمدًا: <strong className="font-bold">صرف العمولة ليس مصروفًا</strong> — خُصم
            الاستحقاق مرة واحدة وقت الزيارة، وتسجيل الصرف مصروفًا يخصمه مرتين. عكس سند يُحتسب في
            شهر العكس لا شهر الصرف، فلا يتغيّر تقرير شهر مضى.
          </p>
        </div>
        <table className="dashboard-table min-w-[760px]">
          <thead>
            <tr>
              <th>الشهر</th>
              <th>مستحق خلال الشهر</th>
              <th>مصروف خلال الشهر</th>
              <th>تغيّر دَين العمولات</th>
            </tr>
          </thead>
          <tbody>
            {report.months.map((month) => (
              <tr key={month.monthKey}>
                <td className="px-4 py-3 font-bold">{month.monthLabel}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(month.commissionAccrued)}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(month.commissionPaid)}</td>
                <td className={`px-4 py-3 tabular-nums font-bold ${month.commissionBalanceDelta > 0 ? "text-salon-ruby" : "text-salon-forest"}`}>
                  {month.commissionBalanceDelta > 0 ? "+" : ""}{formatMoney(month.commissionBalanceDelta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablePanel>

      <TablePanel>
        <div className="border-b border-salon-line/70 px-5 py-4">
          <h2 className="lux-section-title">رصيد كل حلاق خلال المدة</h2>
          <p className="dashboard-muted mt-1 text-sm leading-6">
            رصيد أول المدة + المستحق − المصروف = رصيد آخر المدة. الرصيد السالب يعني مدفوعًا مقدمًا.
            الصرف نفسه يتم من <Link href="/dashboard/commissions" className="font-bold underline">شاشة المستحقات</Link> على الرصيد الجاري.
          </p>
        </div>
        <table className="dashboard-table min-w-[900px]">
          <thead>
            <tr>
              <th>الحلاق</th>
              <th>الفرع</th>
              <th>زيارات المدة</th>
              <th>رصيد أول المدة</th>
              <th>مستحق</th>
              <th>مصروف</th>
              <th>رصيد آخر المدة</th>
            </tr>
          </thead>
          <tbody>
            {commissions.rows.map((row) => (
              <tr key={row.barberId}>
                <td className="px-4 py-3 font-bold">
                  {row.barberName}
                  {!row.isActive ? <span className="mr-2"><Badge tone="neutral">معطّل</Badge></span> : null}
                </td>
                <td className="px-4 py-3">{row.salonName || "-"}</td>
                <td className="px-4 py-3 tabular-nums">{formatNumber(row.visitsCount)}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(row.opening)}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(row.accrued)}</td>
                <td className="px-4 py-3 tabular-nums">{formatMoney(row.paid)}</td>
                <td className={`px-4 py-3 lux-number ${row.closing > 0 ? "text-salon-ruby" : "text-salon-forest"}`}>
                  {formatMoney(row.closing)}
                </td>
              </tr>
            ))}
            {commissions.rows.length === 0 ? (
              <tr><td colSpan={7} className="p-5"><InlineEmpty title="لا توجد حركة عمولات في المدة" hint="اضبط نسب العمولة من صفحة الحلاقين ليبدأ الاستحقاق." /></td></tr>
            ) : null}
          </tbody>
          {commissions.rows.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-salon-line bg-[#faf8f3]">
                <td className="px-4 py-3 font-black" colSpan={3}>الإجمالي</td>
                <td className="px-4 py-3 font-bold tabular-nums">{formatMoney(commissions.totals.opening)}</td>
                <td className="px-4 py-3 font-bold tabular-nums">{formatMoney(commissions.totals.accrued)}</td>
                <td className="px-4 py-3 font-bold tabular-nums">{formatMoney(commissions.totals.paid)}</td>
                <td className="px-4 py-3 lux-number">{formatMoney(commissions.totals.closing)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </TablePanel>

      <SectionPanel title="المصروفات حسب البند خلال المدة">
        {report.expensesByCategory.length > 0 ? (
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {report.expensesByCategory.map((row) => (
              <div key={row.category} className="dashboard-soft-panel flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-semibold">{row.label}</span>
                <span className="lux-number text-lg">{formatMoney(row.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-5"><InlineEmpty title="لا توجد مصروفات في المدة" hint="سجّل المصروفات من شاشة المصروفات ليظهر توزيعها." /></div>
        )}
      </SectionPanel>

      <Notice tone="info" title="كيف تُقرأ هذه الأرقام" className="mt-6">
        المبيعات تُنسب إلى شهر <strong className="font-bold">تاريخ الزيارة</strong>، والمصروفات إلى
        شهر <strong className="font-bold">تاريخ المصروف التشغيلي</strong> لا تاريخ إدخاله. تكلفة
        المنتجات محفوظة <strong className="font-bold">بتكلفة لحظة البيع</strong>، فتعديل تكلفة منتج
        اليوم لا يعيد كتابة أرباح شهر مضى. الأرقام تُحسب لحظة الفتح، فإلغاء زيارة قديمة أو تعديل
        مبلغها يظهر أثره في شهرها الأصلي. الحد الأقصى للمدى {formatNumber(MAX_FINANCIAL_MONTHS)} شهرًا.
      </Notice>
    </DashboardShell>
  );
}

/**
 * المدى الجاهز يغلب الحقلين إلا عند «مدى مخصص» — وإلا لبقي الاختيار السابق
 * ظاهرًا في الحقلين بينما المستخدم اختار «آخر 6 أشهر» فقرأ مدى لم يطلبه.
 */
function resolvePreset(params: { preset?: string; from?: string; to?: string }, now: Date) {
  const preset = params.preset ?? (params.from || params.to ? "custom" : "current");
  const current = toRiyadhMonthKey(now);
  const monthsBack = (count: number) => toRiyadhMonthKey(addRiyadhMonths(now, -count));

  if (preset === "previous") return { preset, from: monthsBack(1), to: monthsBack(1) };
  if (preset === "last3") return { preset, from: monthsBack(2), to: current };
  if (preset === "last6") return { preset, from: monthsBack(5), to: current };
  if (preset === "last12") return { preset, from: monthsBack(11), to: current };
  if (preset === "custom") return { preset, from: params.from, to: params.to };
  return { preset: "current", from: current, to: current };
}

function percentChange(previous: number, current: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
