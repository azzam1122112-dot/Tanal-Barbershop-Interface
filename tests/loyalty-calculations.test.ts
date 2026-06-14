import { describe, expect, it } from "vitest";
import { calculateVisitTotals } from "../lib/loyalty/calculations";

describe("loyalty visit calculations", () => {
  it("calculates net amount and points after discount by default", () => {
    expect(
      calculateVisitTotals({
        grossAmount: 120,
        discountAmount: 25,
        pointsPerCurrencyUnit: 1,
      }),
    ).toEqual({
      grossAmount: 120,
      discountAmount: 25,
      netAmount: 95,
      pointsEarned: 95,
    });
  });

  it("can calculate points before discount when settings allow it", () => {
    expect(
      calculateVisitTotals({
        grossAmount: 120,
        discountAmount: 25,
        pointsPerCurrencyUnit: 1,
        pointsCalculatedAfterDiscount: false,
      }).pointsEarned,
    ).toBe(120);
  });

  it("does not allow net amount below zero", () => {
    expect(
      calculateVisitTotals({
        grossAmount: 20,
        discountAmount: 50,
      }),
    ).toMatchObject({
      netAmount: 0,
      pointsEarned: 0,
    });
  });
});
