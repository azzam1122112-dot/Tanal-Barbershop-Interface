import { Prisma, type ExpenseCategory, type PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { roundMoney } from "@/lib/visits/visit-totals";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses/expense-service";
import { contributionMargin, grossProfit, organizationContribution } from "./contribution";
import { formatMonthLabel } from "@/lib/format";
import {
  addRiyadhMonths,
  getRiyadhMonthSpan,
  isRiyadhMonthKey,
  RIYADH_TIME_ZONE,
  riyadhMonthKeysBetween,
  toRiyadhMonthKey,
} from "@/lib/datetime/riyadh";

/**
 * الطبقة المالية الشهرية — **مصدر الحقيقة الوحيد لكل رقم ربحية في النظام**.
 *
 * قبل هذا الملف كان «الربح» معرَّفًا بثلاث صيغ مختلفة في ثلاث شاشات: التقارير
 * كانت تخصم المصروفات بلا عمولات، والمصروفات ومقارنة الفروع تخصم الاثنين. أي أن
 * نفس الفترة تُخرج رقمين مختلفين حسب الشاشة التي فتحها المالك. المعادلة الآن
 * مكتوبة مرة واحدة في `organizationContribution` ولا تُعاد كتابتها في أي مكان.
 *
 * **أساس الاستحقاق لا النقد.** العمولة تُستحق لحظة الزيارة وتُصرف بعد أسابيع؛ لو
 * حُسب الشهر نقديًا لظهر شهرٌ صُرفت فيه دفعتان كأنه خاسر وشهرٌ لم يُصرف فيه شيء
 * كأنه ممتاز. لذلك `commissionAccrued` (من الزيارات) هو ما يدخل قائمة الدخل،
 * و`commissionPaid` (من سندات الصرف) يُعرض بجانبه كحركة نقدية لا كمصروف.
 *
 * **التجميع في PostgreSQL لا في Node.** التقارير القديمة تجلب صفوف الزيارات كلها
 * مع علاقاتها ثم تجمعها بـ JS — مقبول ليوم واحد، وكارثي لاثني عشر شهرًا × عدة
 * فروع. هنا `to_char(... AT TIME ZONE ...)` يبني دلو الشهر داخل القاعدة، وشرط
 * المدى يبقى على العمود الخام فيستفيد من الفهارس القائمة على `visitedAt`.
 */

/** سقف يحمي الخادم من طلب «من 1990 إلى اليوم» عبر تعديل الرابط. */
export const MAX_FINANCIAL_MONTHS = 24;

export type FinancialScope = {
  organizationId: string;
  /** `null` = كل فروع المؤسسة. مصفوفة = فروع الجلسة المسندة. */
  salonIds?: string[] | null;
};

export type FinancialMonthRow = {
  monthKey: string;
  monthLabel: string;
  from: string;
  to: string;
  visitsCount: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  cashSales: number;
  cardSales: number;
  averageTicket: number;
  /** مبيعات المنتجات ضمن صافي المبيعات (لا تُضاف إليه). */
  productSales: number;
  /** تكلفة ما بيع من مخزون، بلقطة التكلفة وقت البيع. */
  productCost: number;
  /** صافي المبيعات ناقص تكلفة المنتجات. */
  grossProfit: number;
  /** المستحق للحلاقين عن زيارات الشهر — يدخل قائمة الدخل. */
  commissionAccrued: number;
  expensesTotal: number;
  expensesCashDrawer: number;
  expensesExternal: number;
  expensesCount: number;
  /** المتبقي للمؤسسة: صافي المبيعات − العمولات المستحقة − المصروفات. */
  contribution: number;
  /** المصروف فعلًا خلال الشهر صافيًا من العكوسات — حركة نقدية لا مصروف. */
  commissionPaid: number;
  /** تغيّر دَين العمولات خلال الشهر: موجب = تراكم على المؤسسة. */
  commissionBalanceDelta: number;
};

export { contributionMargin, grossProfit, organizationContribution } from "./contribution";

/**
 * يحسم مدى الأشهر المطلوب. الافتراضي = الشهر الجاري وحده، والمقلوب يُصحَّح بدل
 * أن يعيد نتيجة فارغة تُقرأ كأن الفرع بلا مبيعات.
 */
export function resolveMonthSpan(
  fromKey?: string | null,
  toKey?: string | null,
  now = new Date(),
) {
  const current = toRiyadhMonthKey(now);
  const rawFrom = isRiyadhMonthKey(fromKey) ? fromKey : current;
  const rawTo = isRiyadhMonthKey(toKey) ? toKey : rawFrom;
  const [first, last] = rawFrom <= rawTo ? [rawFrom, rawTo] : [rawTo, rawFrom];
  const monthKeys = riyadhMonthKeysBetween(first, last);
  if (monthKeys.length > MAX_FINANCIAL_MONTHS) {
    throw new BusinessError(`أقصى مدى للتقرير المالي ${MAX_FINANCIAL_MONTHS} شهرًا`, 400);
  }
  const { from, to } = getRiyadhMonthSpan(first, last);
  return { fromKey: first, toKey: last, from, to, monthKeys };
}

export type FinancialPeriodReport = Awaited<ReturnType<typeof getFinancialPeriodReport>>;

export async function getFinancialPeriodReport(
  prisma: PrismaClient,
  input: FinancialScope & { fromKey?: string | null; toKey?: string | null; now?: Date },
) {
  const span = resolveMonthSpan(input.fromKey, input.toKey, input.now ?? new Date());
  const salonIds = input.salonIds && input.salonIds.length > 0 ? input.salonIds : null;

  const [visitRows, expenseRows, payoutRows, productRows, categoryRows] = await Promise.all([
    queryVisitMonths(prisma, input.organizationId, salonIds, span.from, span.to),
    queryExpenseMonths(prisma, input.organizationId, salonIds, span.from, span.to),
    queryPayoutMonths(prisma, input.organizationId, salonIds, span.from, span.to),
    queryProductMonths(prisma, input.organizationId, salonIds, span.from, span.to),
    queryExpenseCategories(prisma, input.organizationId, salonIds, span.from, span.to),
  ]);

  const visitsBy = indexByMonth(visitRows);
  const expensesBy = indexByMonth(expenseRows);
  const payoutsBy = indexByMonth(payoutRows);
  const productsBy = indexByMonth(productRows);

  // نبني الصفوف من قائمة الأشهر لا من نتائج الاستعلام: شهرٌ بلا حركة يجب أن يظهر
  // بصفر لا أن يختفي، وإلا قرأ المالك اثني عشر شهرًا وهي تسعة ولم ينتبه.
  const months: FinancialMonthRow[] = span.monthKeys.map((monthKey) => {
    const visits = visitsBy.get(monthKey);
    const expenses = expensesBy.get(monthKey);
    const payouts = payoutsBy.get(monthKey);
    const products = productsBy.get(monthKey);
    const monthFrom = monthStart(monthKey, span.from, span.monthKeys);

    const netSales = roundMoney(visits?.netSales ?? 0);
    const commissionAccrued = roundMoney(visits?.commissionAccrued ?? 0);
    const expensesTotal = roundMoney(expenses?.total ?? 0);
    const productCost = roundMoney(products?.productCost ?? 0);
    const visitsCount = visits?.visitsCount ?? 0;
    const commissionPaid = roundMoney((payouts?.paid ?? 0) - (payouts?.reversed ?? 0));

    return {
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      from: monthFrom.toISOString(),
      to: addRiyadhMonths(monthFrom, 1).toISOString(),
      visitsCount,
      grossSales: roundMoney(visits?.grossSales ?? 0),
      discounts: roundMoney(visits?.discounts ?? 0),
      netSales,
      cashSales: roundMoney(visits?.cashSales ?? 0),
      cardSales: roundMoney(visits?.cardSales ?? 0),
      averageTicket: visitsCount > 0 ? roundMoney(netSales / visitsCount) : 0,
      productSales: roundMoney(products?.productSales ?? 0),
      productCost,
      grossProfit: grossProfit(netSales, productCost),
      commissionAccrued,
      expensesTotal,
      expensesCashDrawer: roundMoney(expenses?.cashDrawer ?? 0),
      expensesExternal: roundMoney(expenses?.external ?? 0),
      expensesCount: expenses?.count ?? 0,
      contribution: organizationContribution({ netSales, productCost, commissionAccrued, expensesTotal }),
      commissionPaid,
      commissionBalanceDelta: roundMoney(commissionAccrued - commissionPaid),
    };
  });

  const totals = sumMonths(months);
  const best = pickExtreme(months, (a, b) => b.netSales - a.netSales);
  const weakest = months.length > 1 ? pickExtreme(months, (a, b) => a.netSales - b.netSales) : null;

  return {
    fromKey: span.fromKey,
    toKey: span.toKey,
    from: span.from.toISOString(),
    to: span.to.toISOString(),
    monthsCount: months.length,
    months,
    totals,
    /** متوسط شهري — يجعل مقارنة مدى بمدى آخر ذات معنى رغم اختلاف عدد الأشهر. */
    monthlyAverage: {
      netSales: months.length > 0 ? roundMoney(totals.netSales / months.length) : 0,
      contribution: months.length > 0 ? roundMoney(totals.contribution / months.length) : 0,
      expensesTotal: months.length > 0 ? roundMoney(totals.expensesTotal / months.length) : 0,
    },
    best,
    weakest,
    /** وحدات بيعت بلا تكلفة مسجّلة — تجعل مجمل الربح أعلى من حقيقته. */
    unpricedProductUnits: productRows.reduce((total, row) => total + row.unpricedUnits, 0),
    expensesByCategory: categoryRows
      .map((row) => ({
        category: row.category,
        label: EXPENSE_CATEGORY_LABELS[row.category],
        amount: roundMoney(row.amount),
      }))
      .sort((a, b) => b.amount - a.amount),
  };
}

function sumMonths(months: FinancialMonthRow[]) {
  const totals = months.reduce(
    (total, month) => ({
      visitsCount: total.visitsCount + month.visitsCount,
      grossSales: total.grossSales + month.grossSales,
      discounts: total.discounts + month.discounts,
      netSales: total.netSales + month.netSales,
      cashSales: total.cashSales + month.cashSales,
      cardSales: total.cardSales + month.cardSales,
      productSales: total.productSales + month.productSales,
      productCost: total.productCost + month.productCost,
      commissionAccrued: total.commissionAccrued + month.commissionAccrued,
      commissionPaid: total.commissionPaid + month.commissionPaid,
      expensesTotal: total.expensesTotal + month.expensesTotal,
      expensesCashDrawer: total.expensesCashDrawer + month.expensesCashDrawer,
      expensesExternal: total.expensesExternal + month.expensesExternal,
      expensesCount: total.expensesCount + month.expensesCount,
    }),
    {
      visitsCount: 0,
      grossSales: 0,
      discounts: 0,
      netSales: 0,
      cashSales: 0,
      cardSales: 0,
      productSales: 0,
      productCost: 0,
      commissionAccrued: 0,
      commissionPaid: 0,
      expensesTotal: 0,
      expensesCashDrawer: 0,
      expensesExternal: 0,
      expensesCount: 0,
    },
  );

  const netSales = roundMoney(totals.netSales);
  const commissionAccrued = roundMoney(totals.commissionAccrued);
  const expensesTotal = roundMoney(totals.expensesTotal);
  const productCost = roundMoney(totals.productCost);
  const contribution = organizationContribution({ netSales, productCost, commissionAccrued, expensesTotal });

  return {
    ...totals,
    grossSales: roundMoney(totals.grossSales),
    discounts: roundMoney(totals.discounts),
    netSales,
    cashSales: roundMoney(totals.cashSales),
    cardSales: roundMoney(totals.cardSales),
    productSales: roundMoney(totals.productSales),
    productCost,
    grossProfit: grossProfit(netSales, productCost),
    commissionAccrued,
    commissionPaid: roundMoney(totals.commissionPaid),
    expensesTotal,
    expensesCashDrawer: roundMoney(totals.expensesCashDrawer),
    expensesExternal: roundMoney(totals.expensesExternal),
    averageTicket: totals.visitsCount > 0 ? roundMoney(netSales / totals.visitsCount) : 0,
    contribution,
    contributionMargin: contributionMargin(contribution, netSales),
  };
}

// ————————————————————————————————————————————————————————————
// الاستعلامات. مفتاح الشهر يُبنى داخل القاعدة بتحويل الطابع الزمني (المخزَّن UTC)
// إلى توقيت الرياض، فلا يعتمد التقسيم على منطقة خادم Node ولا على إعداد الجلسة.
// ————————————————————————————————————————————————————————————

type VisitMonthRow = {
  monthKey: string;
  visitsCount: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  commissionAccrued: number;
  cashSales: number;
  cardSales: number;
};

function queryVisitMonths(
  prisma: PrismaClient,
  organizationId: string,
  salonIds: string[] | null,
  from: Date,
  to: Date,
) {
  return prisma.$queryRaw<VisitMonthRow[]>(Prisma.sql`
    SELECT
      to_char(("visitedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${RIYADH_TIME_ZONE}, 'YYYY-MM') AS "monthKey",
      COUNT(*)::int AS "visitsCount",
      COALESCE(SUM("grossAmount"), 0)::float8 AS "grossSales",
      COALESCE(SUM("discountAmount"), 0)::float8 AS "discounts",
      COALESCE(SUM("netAmount"), 0)::float8 AS "netSales",
      COALESCE(SUM("commissionAmount"), 0)::float8 AS "commissionAccrued",
      COALESCE(SUM(CASE WHEN "paymentMethod" = 'CASH' THEN "netAmount" ELSE 0 END), 0)::float8 AS "cashSales",
      COALESCE(SUM(CASE WHEN "paymentMethod" = 'NETWORK' THEN "netAmount" ELSE 0 END), 0)::float8 AS "cardSales"
    FROM "Visit"
    WHERE "status" = 'COMPLETED'
      AND "organizationId" = ${organizationId}
      AND "visitedAt" >= ${from}
      AND "visitedAt" < ${to}
      ${salonScopeSql(salonIds)}
    GROUP BY 1
  `);
}

type ExpenseMonthRow = {
  monthKey: string;
  count: number;
  total: number;
  cashDrawer: number;
  external: number;
};

/**
 * المصروفات تُجمَّع على `expenseDate` — تاريخ المصروف التشغيلي — لا على `createdAt`.
 * مصروف ٣٠ يوليو يُدخَل ٢ أغسطس ينتمي ليوليو، وإلا اختلف الشهر بين شاشة وأخرى.
 */
function queryExpenseMonths(
  prisma: PrismaClient,
  organizationId: string,
  salonIds: string[] | null,
  from: Date,
  to: Date,
) {
  return prisma.$queryRaw<ExpenseMonthRow[]>(Prisma.sql`
    SELECT
      to_char(("expenseDate" AT TIME ZONE 'UTC') AT TIME ZONE ${RIYADH_TIME_ZONE}, 'YYYY-MM') AS "monthKey",
      COUNT(*)::int AS "count",
      COALESCE(SUM("amount"), 0)::float8 AS "total",
      COALESCE(SUM(CASE WHEN "paymentSource" = 'CASH_DRAWER' THEN "amount" ELSE 0 END), 0)::float8 AS "cashDrawer",
      COALESCE(SUM(CASE WHEN "paymentSource" = 'EXTERNAL' THEN "amount" ELSE 0 END), 0)::float8 AS "external"
    FROM "CashExpense"
    WHERE "organizationId" = ${organizationId}
      AND "expenseDate" >= ${from}
      AND "expenseDate" < ${to}
      ${salonScopeSql(salonIds)}
    GROUP BY 1
  `);
}

type PayoutMonthRow = { monthKey: string; paid: number; reversed: number };

/**
 * الصرف والعكس حركتان مستقلتان زمنيًا: العكس يُحتسب في **شهر العكس** لا في شهر
 * السند الأصلي. الطرح من شهر مضى يعيد كتابة تقرير سبق أن قرأه المالك واعتمد عليه.
 */
function queryPayoutMonths(
  prisma: PrismaClient,
  organizationId: string,
  salonIds: string[] | null,
  from: Date,
  to: Date,
) {
  return prisma.$queryRaw<PayoutMonthRow[]>(Prisma.sql`
    SELECT
      "monthKey",
      COALESCE(SUM("paid"), 0)::float8 AS "paid",
      COALESCE(SUM("reversed"), 0)::float8 AS "reversed"
    FROM (
      SELECT
        to_char(("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${RIYADH_TIME_ZONE}, 'YYYY-MM') AS "monthKey",
        "amount" AS "paid",
        0::numeric AS "reversed"
      FROM "CommissionPayout"
      WHERE "organizationId" = ${organizationId}
        AND "paidAt" >= ${from}
        AND "paidAt" < ${to}
        ${salonScopeSql(salonIds)}
      UNION ALL
      SELECT
        to_char(("reversedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${RIYADH_TIME_ZONE}, 'YYYY-MM') AS "monthKey",
        0::numeric AS "paid",
        "amount" AS "reversed"
      FROM "CommissionPayout"
      WHERE "organizationId" = ${organizationId}
        AND "reversedAt" IS NOT NULL
        AND "reversedAt" >= ${from}
        AND "reversedAt" < ${to}
        ${salonScopeSql(salonIds)}
    ) AS movements
    GROUP BY 1
  `);
}

type ProductMonthRow = { monthKey: string; productSales: number; productCost: number; unpricedUnits: number };

/**
 * مبيعات المنتجات وتكلفتها.
 *
 * التكلفة من `VisitProduct.unitCost` — لقطة وقت البيع — لا من `Product.costPrice`
 * الحالي: قراءة الكتالوج وقت التقرير تجعل تعديل تكلفة منتج واحد يعيد كتابة مجمل
 * ربح كل شهر مضى. `unpricedUnits` يعدّ ما بيع بلا تكلفة مسجّلة حتى يُعلَن نقص
 * التغطية بدل أن يظهر مجمل الربح أعلى من حقيقته بصمت.
 */
function queryProductMonths(
  prisma: PrismaClient,
  organizationId: string,
  salonIds: string[] | null,
  from: Date,
  to: Date,
) {
  return prisma.$queryRaw<ProductMonthRow[]>(Prisma.sql`
    SELECT
      to_char((v."visitedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${RIYADH_TIME_ZONE}, 'YYYY-MM') AS "monthKey",
      COALESCE(SUM(vp."lineTotal"), 0)::float8 AS "productSales",
      COALESCE(SUM(CASE WHEN vp."unitCost" IS NOT NULL THEN vp."unitCost" * vp."quantity" ELSE 0 END), 0)::float8 AS "productCost",
      COALESCE(SUM(CASE WHEN vp."unitCost" IS NULL THEN vp."quantity" ELSE 0 END), 0)::int AS "unpricedUnits"
    FROM "VisitProduct" vp
    JOIN "Visit" v ON v."id" = vp."visitId"
    WHERE v."status" = 'COMPLETED'
      AND v."organizationId" = ${organizationId}
      AND v."visitedAt" >= ${from}
      AND v."visitedAt" < ${to}
      ${salonIds ? Prisma.sql`AND v."salonId" IN (${Prisma.join(salonIds)})` : Prisma.empty}
    GROUP BY 1
  `);
}

async function queryExpenseCategories(
  prisma: PrismaClient,
  organizationId: string,
  salonIds: string[] | null,
  from: Date,
  to: Date,
) {
  const rows = await prisma.cashExpense.groupBy({
    by: ["category"],
    where: {
      organizationId,
      expenseDate: { gte: from, lt: to },
      ...(salonIds ? { salonId: { in: salonIds } } : {}),
    },
    _sum: { amount: true },
  });
  return rows.map((row) => ({ category: row.category as ExpenseCategory, amount: Number(row._sum.amount ?? 0) }));
}

/** قيد الفرع كجزء SQL. `null` = بلا قيد (مالك/مدير على كل الفروع). */
function salonScopeSql(salonIds: string[] | null) {
  return salonIds ? Prisma.sql`AND "salonId" IN (${Prisma.join(salonIds)})` : Prisma.empty;
}

function indexByMonth<T extends { monthKey: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.monthKey, row]));
}

function monthStart(monthKey: string, spanFrom: Date, monthKeys: string[]) {
  return addRiyadhMonths(spanFrom, monthKeys.indexOf(monthKey));
}

function pickExtreme(months: FinancialMonthRow[], compare: (a: FinancialMonthRow, b: FinancialMonthRow) => number) {
  return months.length > 0 ? [...months].sort(compare)[0] : null;
}
