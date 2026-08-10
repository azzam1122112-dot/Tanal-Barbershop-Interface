import { z } from "zod";

export const commissionRateSchema = z.number().min(0).max(100);

export type CommissionLineInput = {
  serviceId: string;
  /** إجمالي السطر قبل الخصم — يُستخدم لتوزيع الوعاء بين الخدمات. */
  lineTotal: number;
  /** نسبة الخدمة إن وُجدت، وإلا null. */
  serviceRate?: number | null;
};

export type CommissionLineResult<TLine extends CommissionLineInput = CommissionLineInput> = TLine & {
  commissionRate: number;
  /** حصة السطر من المبلغ بعد الخصم. */
  commissionBase: number;
  commissionAmount: number;
};

/**
 * يحسب عمولة الحلاق على زيارة.
 *
 * القواعد الجوهرية:
 * - الوعاء هو **المبلغ بعد الخصم** — لا عمولة على خصم لم يدفعه العميل.
 * - أسبقية النسبة: نسبة الخدمة ← نسبة الحلاق ← النسبة الافتراضية للفرع.
 * - الوعاء يُوزَّع على الخدمات بنسبة قيمة كل سطر، فتُطبَّق نسبة كل خدمة على حصتها فقط.
 * - عند تعطيل عمولة الحلاق تصبح كل النسب صفرًا، بما فيها نسبة الخدمة.
 */
export function calculateVisitCommission<TLine extends CommissionLineInput>(input: {
  lines: TLine[];
  /** المبلغ بعد الخصم. */
  commissionBase: number;
  /** بوابة العمولة للحلاق. القيمة الافتراضية true للتوافق مع الاستدعاءات القديمة. */
  enabled?: boolean;
  barberRate?: number | null;
  defaultRate?: number | null;
}): { totalCommission: number; lines: CommissionLineResult<TLine>[] } {
  const enabled = input.enabled !== false;
  const fallbackRate = enabled ? clampRate(input.barberRate ?? input.defaultRate ?? 0) : 0;
  const linesTotal = round(input.lines.reduce((total, line) => total + line.lineTotal, 0));

  const lines = input.lines.map((line) => {
    const commissionRate = enabled ? clampRate(line.serviceRate ?? input.barberRate ?? input.defaultRate ?? 0) : 0;
    // بلا قيمة للسطور (خدمات مجانية) نوزّع بالتساوي بدل القسمة على صفر.
    const share =
      linesTotal > 0
        ? line.lineTotal / linesTotal
        : input.lines.length > 0
          ? 1 / input.lines.length
          : 0;
    const commissionBase = round(input.commissionBase * share);
    return {
      ...line,
      commissionRate,
      commissionBase,
      commissionAmount: round((commissionBase * commissionRate) / 100),
    };
  });

  const totalCommission = round(lines.reduce((total, line) => total + line.commissionAmount, 0));

  return { totalCommission: lines.length > 0 ? totalCommission : round((input.commissionBase * fallbackRate) / 100), lines };
}

/** النسبة الفعّالة لحلاق (للعرض في الواجهات). */
export function resolveBarberRate(barberRate?: number | null, defaultRate?: number | null) {
  return clampRate(barberRate ?? defaultRate ?? 0);
}

function clampRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, round(value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
