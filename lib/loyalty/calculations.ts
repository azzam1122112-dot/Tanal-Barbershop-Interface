import { z } from "zod";

export const visitCalculationInputSchema = z.object({
  grossAmount: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().default(0),
  pointsPerCurrencyUnit: z.number().positive().default(1),
  pointsCalculatedAfterDiscount: z.boolean().default(true),
});

export function calculateVisitTotals(input: z.input<typeof visitCalculationInputSchema>) {
  const data = visitCalculationInputSchema.parse(input);
  const netAmount = Math.max(0, data.grossAmount - data.discountAmount);
  const pointsBase = data.pointsCalculatedAfterDiscount ? netAmount : data.grossAmount;
  const pointsEarned = Math.floor(pointsBase * data.pointsPerCurrencyUnit);

  return {
    grossAmount: roundMoney(data.grossAmount),
    discountAmount: roundMoney(data.discountAmount),
    netAmount: roundMoney(netAmount),
    pointsEarned,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
