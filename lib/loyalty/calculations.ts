import { z } from "zod";

export const visitCalculationInputSchema = z.object({
  grossAmount: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().default(0),
  pointsPerCurrencyUnit: z.number().positive().default(1),
  pointsCalculatedAfterDiscount: z.boolean().default(true),
});

export type VisitTotalsResult = {
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  pointsEarned: number;
};

export function calculateVisitTotals(input: z.input<typeof visitCalculationInputSchema>): VisitTotalsResult {
  const data = visitCalculationInputSchema.parse(input);
  const netAmount = roundMoney(Math.max(0, data.grossAmount - data.discountAmount));
  const pointsBase = data.pointsCalculatedAfterDiscount ? netAmount : roundMoney(data.grossAmount);

  return {
    grossAmount: roundMoney(data.grossAmount),
    discountAmount: roundMoney(data.discountAmount),
    netAmount,
    pointsEarned: Math.floor(pointsBase * data.pointsPerCurrencyUnit),
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
