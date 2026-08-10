import { redirect } from "next/navigation";
import { ExpenseCategory, ExpensePaymentSource } from "@prisma/client";
import { ExpenseCreateForm, ExpenseDeleteButton } from "@/components/dashboard/expense-manager";
import { Badge, DashboardShell, Field, FilterBar, InlineEmpty, SectionPanel, StatCard, TablePanel } from "@/components/dashboard/ui";
import { canAccessDashboard } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { EXPENSE_CATEGORY_LABELS, getExpensesReport } from "@/lib/expenses/expense-service";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { getPresetRange, getRevenueReport } from "@/lib/reports/dashboard-reports";
import { addRiyadhDays, parseRiyadhDateKey, toRiyadhDateKey } from "@/lib/datetime/riyadh";

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; category?: string; paymentSource?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session) || session.type !== "dashboard") redirect("/barber");

  const params = await searchParams;
  const { organizationId, orgWhere, salonWhere, salonIds, activeSalonId } = dashboardScope(session);
  if (!organizationId) redirect("/dashboard");

  const preset = params.preset ?? "month";
  const presetRange = getPresetRange(preset);
  const from = params.from ? parseRiyadhDateKey(params.from) : presetRange.from;
  const to = params.to ? addRiyadhDays(parseRiyadhDateKey(params.to), 1) : presetRange.to;
  const category = isExpenseCategory(params.category) ? params.category : null;
  const paymentSource = isPaymentSource(params.paymentSource) ? params.paymentSource : null;
  const baseFilters = { organizationId, salonIds, from, to };
  const salonRecordWhere = salonIds ? { id: { in: salonIds } } : {};
  const hasListFilters = Boolean(category || paymentSource);
  const fullReportPromise = getExpensesReport(prisma, baseFilters);
  const filteredReportPromise = hasListFilters
    ? getExpensesReport(prisma, { ...baseFilters, category, paymentSource })
    : fullReportPromise;

  const [salons, openSessions, revenue, fullReport, report] = await Promise.all([
    prisma.salon.findMany({
      where: { ...orgWhere, ...salonRecordWhere, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.cashSession.findMany({
      where: { ...orgWhere, ...salonWhere, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      select: {
        id: true,
        salonId: true,
        salon: { select: { name: true } },
        barber: { select: { name: true } },
      },
    }),
    getRevenueReport(prisma, baseFilters),
    fullReportPromise,
    filteredReportPromise,
  ]);

  const operatingNet = revenue.netAmount - revenue.commissionAmount - fullReport.total;
  const today = toRiyadhDateKey(new Date());

  return (
    <DashboardShell
      title="الإيرادات والمصروفات"
      description="سجل واضح لمصروفات الفروع، ومقارنة مباشرة بين صافي المبيعات والمصروفات وصافي التشغيل."
    >
      <FilterBar className="lg:grid-cols-[150px_150px_150px_1fr_1fr_120px]">
        <Field label="الفترة">
          <select name="preset" defaultValue={preset} className="dashboard-field">
            <option value="today">اليوم</option>
            <option value="yesterday">أمس</option>
            <option value="last7">آخر 7 أيام</option>
            <option value="month">هذا الشهر</option>
            <option value="custom">فترة مخصصة</option>
          </select>
        </Field>
        <Field label="من تاريخ"><input dir="ltr" lang="en" name="from" type="date" defaultValue={params.from ?? ""} className="dashboard-field" /></Field>
        <Field label="إلى تاريخ"><input dir="ltr" lang="en" name="to" type="date" defaultValue={params.to ?? ""} className="dashboard-field" /></Field>
        <Field label="بند المصروف">
          <select name="category" defaultValue={category ?? ""} className="dashboard-field">
            <option value="">كل البنود</option>
            {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="مصدر الدفع">
          <select name="paymentSource" defaultValue={paymentSource ?? ""} className="dashboard-field">
            <option value="">كل المصادر</option>
            <option value="CASH_DRAWER">من درج الكاش</option>
            <option value="EXTERNAL">دفع خارجي</option>
          </select>
        </Field>
        <button className="dashboard-button">تطبيق</button>
      </FilterBar>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="إيرادات المبيعات" value={formatMoney(revenue.netAmount)} subValue={`${formatNumber(revenue.visitsCount)} زيارة مكتملة`} />
        <StatCard label="عمولات الحلاقين" value={formatMoney(revenue.commissionAmount)} subValue="مستحقات محفوظة مع العمليات" />
        <StatCard label="إجمالي المصروفات" value={formatMoney(fullReport.total)} subValue={`${formatNumber(fullReport.count)} حركة`} tone={fullReport.total > 0 ? "danger" : "neutral"} />
        <StatCard label="المتبقي للمؤسسة" value={formatMoney(operatingNet)} subValue="بعد العمولات والمصروفات" tone={operatingNet >= 0 ? "success" : "danger"} />
        <StatCard label="خرج من درج الكاش" value={formatMoney(fullReport.cashDrawerTotal)} subValue={`دفع خارجي ${formatMoney(fullReport.externalTotal)}`} />
      </div>

      <ExpenseCreateForm
        salons={salons}
        openSessions={openSessions.map((cashSession) => ({
          id: cashSession.id,
          salonId: cashSession.salonId,
          salonName: cashSession.salon.name,
          barberName: cashSession.barber.name,
        }))}
        defaultSalonId={activeSalonId ?? salons[0]?.id ?? null}
        today={today}
      />

      <SectionPanel title="المصروفات حسب البند">
        {fullReport.byCategory.length > 0 ? (
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {fullReport.byCategory.map((row) => (
              <div key={row.category} className="dashboard-soft-panel flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-semibold">{row.label}</span>
                <span className="lux-number text-lg">{formatMoney(row.amount)}</span>
              </div>
            ))}
          </div>
        ) : <div className="p-5"><InlineEmpty title="لا توجد مصروفات في الفترة" hint="سجّل أول مصروف ليظهر توزيعه حسب البند." /></div>}
      </SectionPanel>

      <TablePanel>
        <div className="border-b border-salon-line/70 px-5 py-4">
          <h2 className="lux-section-title">تفاصيل المصروفات ({formatNumber(report.count)})</h2>
          {hasListFilters ? <p className="dashboard-muted mt-1 text-sm">القائمة مفلترة، بينما مؤشرات الأعلى تعرض إجمالي الفترة كاملة.</p> : null}
        </div>
        <table className="dashboard-table min-w-[1180px]">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الفرع</th>
              <th>البند</th>
              <th>الوصف</th>
              <th>المستفيد</th>
              <th>المصدر</th>
              <th>المرجع</th>
              <th>سجله</th>
              <th>القيمة</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((expense) => (
              <tr key={expense.id}>
                <td className="px-4 py-3" title={`سُجّل ${formatDateTime(expense.createdAt)}`}>{formatDate(expense.expenseDate)}</td>
                <td className="px-4 py-3 font-bold">{expense.salon.name}</td>
                <td className="px-4 py-3"><Badge tone="info">{expense.categoryLabel}</Badge></td>
                <td className="max-w-xs px-4 py-3 font-semibold">{expense.note}</td>
                <td className="px-4 py-3">{expense.payee ?? "-"}</td>
                <td className="px-4 py-3"><Badge tone={expense.paymentSource === "CASH_DRAWER" ? "warning" : "neutral"}>{expense.paymentSourceLabel}</Badge></td>
                <td className="px-4 py-3" dir="ltr">{expense.reference ?? "-"}</td>
                <td className="px-4 py-3">{expense.recordedBy?.name ?? expense.barber?.name ?? "-"}</td>
                <td className="px-4 py-3 lux-number text-salon-ruby">{formatMoney(expense.amount)}</td>
                <td className="px-4 py-3"><ExpenseDeleteButton expenseId={expense.id} locked={expense.locked} /></td>
              </tr>
            ))}
            {report.rows.length === 0 ? <tr><td colSpan={10} className="p-5"><InlineEmpty title="لا توجد نتائج" hint="غيّر التصفية أو سجّل مصروفًا جديدًا." /></td></tr> : null}
          </tbody>
        </table>
        {report.count > report.rows.length ? (
          <p className="border-t border-salon-line px-5 py-3 text-sm font-semibold text-salon-charcoal">تظهر أحدث 500 حركة من نتائج التصفية.</p>
        ) : null}
      </TablePanel>
    </DashboardShell>
  );
}

function isExpenseCategory(value: string | undefined): value is ExpenseCategory {
  return Boolean(value && Object.prototype.hasOwnProperty.call(EXPENSE_CATEGORY_LABELS, value));
}

function isPaymentSource(value: string | undefined): value is ExpensePaymentSource {
  return value === "CASH_DRAWER" || value === "EXTERNAL";
}
