import { roundMoney } from "@/lib/visits/visit-totals";

/**
 * **المعادلة الوحيدة للمتبقي للمؤسسة** — وحدة بلا تبعيات ليستوردها الجميع.
 *
 * كانت هذه المعادلة مكتوبة بثلاث صيغ في ثلاث شاشات: التقارير تخصم المصروفات بلا
 * عمولات، والمصروفات ومقارنة الفروع تخصم الاثنين. أي أن المالك يقرأ رقمين
 * مختلفين لنفس الفترة حسب الشاشة التي فتحها. لا تُعِد كتابتها في أي مكان.
 *
 * **صرف العمولة ليس مصروفًا:** الاستحقاق مخصوم مرة واحدة وقت الزيارة، فتسجيل
 * الصرف مصروفًا يخصمه مرتين. لذلك المدخل هو المستحق لا المصروف.
 */
export function organizationContribution(input: {
  netSales: number;
  commissionAccrued: number;
  expensesTotal: number;
  /**
   * تكلفة المنتجات المباعة من لقطة `VisitProduct.unitCost`.
   * صفر للفروع التي لا تبيع منتجات أو لم تُسجَّل لها تكلفة — فتبقى المعادلة كما هي.
   */
  productCost?: number;
}) {
  return roundMoney(input.netSales - (input.productCost ?? 0) - input.commissionAccrued - input.expensesTotal);
}

/** مجمل الربح: صافي المبيعات ناقص تكلفة ما بيع من مخزون. */
export function grossProfit(netSales: number, productCost: number) {
  return roundMoney(netSales - productCost);
}

/** هامش المساهمة كنسبة من صافي المبيعات. صفر مبيعات = صفر هامش لا قسمة على صفر. */
export function contributionMargin(contribution: number, netSales: number) {
  return netSales > 0 ? roundMoney((contribution / netSales) * 100) : 0;
}
