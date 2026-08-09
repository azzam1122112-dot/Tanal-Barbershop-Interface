import { z } from "zod";

export const visitCalculationInputSchema = z.object({
  grossAmount: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().default(0),
  pointsPerCurrencyUnit: z.number().positive().default(1),
  pointsCalculatedAfterDiscount: z.boolean().default(true),
  /** ضريبة القيمة المضافة اختيارية بالكامل؛ معطّلة = سلوك النظام السابق حرفيًا. */
  vatEnabled: z.boolean().default(false),
  vatRate: z.number().min(0).max(100).default(0),
  /** true = السعر المدخل شامل الضريبة (الافتراضي في التجزئة السعودية). */
  vatInclusive: z.boolean().default(true),
});

export type VisitTotalsResult = {
  grossAmount: number;
  discountAmount: number;
  /** المبلغ قبل الضريبة (الوعاء الخاضع). يساوي netAmount عند تعطيل الضريبة. */
  subtotalAmount: number;
  vatAmount: number;
  /** المعدّل المطبّق فعليًا على هذه الزيارة (صفر عند التعطيل) — يُخزَّن للتاريخية. */
  vatRate: number;
  /** المبلغ المدفوع فعليًا = subtotalAmount + vatAmount. أساس كل التجميعات المالية. */
  netAmount: number;
  pointsEarned: number;
};

export function calculateVisitTotals(input: z.input<typeof visitCalculationInputSchema>): VisitTotalsResult {
  const data = visitCalculationInputSchema.parse(input);
  const afterDiscount = Math.max(0, data.grossAmount - data.discountAmount);
  const applyVat = data.vatEnabled && data.vatRate > 0;
  const rate = applyVat ? data.vatRate : 0;

  let subtotalAmount: number;
  let vatAmount: number;
  let netAmount: number;

  if (!applyVat) {
    subtotalAmount = roundMoney(afterDiscount);
    vatAmount = 0;
    netAmount = subtotalAmount;
  } else if (data.vatInclusive) {
    // المبلغ المدفوع ثابت؛ نستخرج الضريبة منه.
    netAmount = roundMoney(afterDiscount);
    vatAmount = roundMoney((netAmount * rate) / (100 + rate));
    subtotalAmount = roundMoney(netAmount - vatAmount);
  } else {
    // المبلغ المدخل قبل الضريبة؛ تُضاف فوقه فيزيد المدفوع.
    subtotalAmount = roundMoney(afterDiscount);
    vatAmount = roundMoney((subtotalAmount * rate) / 100);
    netAmount = roundMoney(subtotalAmount + vatAmount);
  }

  // النقاط تُحتسب على المبلغ قبل الضريبة — لا تُكافأ الضريبة.
  const pointsBase = data.pointsCalculatedAfterDiscount ? subtotalAmount : excludeVat(data.grossAmount, rate, data.vatInclusive);
  const pointsEarned = Math.floor(pointsBase * data.pointsPerCurrencyUnit);

  return {
    grossAmount: roundMoney(data.grossAmount),
    discountAmount: roundMoney(data.discountAmount),
    subtotalAmount,
    vatAmount,
    vatRate: rate,
    netAmount,
    pointsEarned,
  };
}

/** يجرّد مبلغًا من الضريبة إن كان شاملًا لها، وإلا يعيده كما هو. */
function excludeVat(amount: number, rate: number, inclusive: boolean) {
  if (rate <= 0 || !inclusive) return roundMoney(amount);
  return roundMoney((amount * 100) / (100 + rate));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/** إعدادات الضريبة المستخرجة من `SystemSettings` بشكل آمن للاستخدام في الحساب. */
export function readVatSettings(settings: {
  vatEnabled?: boolean;
  vatRate?: { toString(): string } | number | null;
  vatInclusive?: boolean;
} | null) {
  return {
    vatEnabled: settings?.vatEnabled ?? false,
    vatRate: settings?.vatRate != null ? Number(settings.vatRate) : 0,
    vatInclusive: settings?.vatInclusive ?? true,
  };
}
