import { describe, expect, it } from "vitest";
import { aggregateVisitTotals, type VisitWithLoyalty } from "../lib/visits/visit-totals";

function visit(partial: {
  gross: number;
  discount: number;
  net: number;
  payment: "CASH" | "NETWORK";
  discountType?: "NONE" | "REWARD" | "CAMPAIGN" | "MANAGER_REWARD";
  earn?: number;
  redeem?: number;
}): VisitWithLoyalty {
  const loyaltyTransactions = [] as { type: string; points: number }[];
  if (partial.earn) loyaltyTransactions.push({ type: "EARN", points: partial.earn });
  if (partial.redeem) loyaltyTransactions.push({ type: "REDEEM", points: -partial.redeem });

  return {
    grossAmount: partial.gross,
    discountAmount: partial.discount,
    netAmount: partial.net,
    paymentMethod: partial.payment,
    discountType: partial.discountType ?? "NONE",
    loyaltyTransactions,
  } as unknown as VisitWithLoyalty;
}

describe("aggregateVisitTotals", () => {
  it("returns zeros for an empty set", () => {
    const totals = aggregateVisitTotals([]);
    expect(totals).toMatchObject({ visitsCount: 0, grossTotal: 0, cashTotal: 0, cardTotal: 0 });
  });

  it("splits cash vs network by net amount", () => {
    const totals = aggregateVisitTotals([
      visit({ gross: 100, discount: 0, net: 100, payment: "CASH" }),
      visit({ gross: 80, discount: 10, net: 70, payment: "NETWORK" }),
    ]);
    expect(totals.visitsCount).toBe(2);
    expect(totals.grossTotal).toBe(180);
    expect(totals.discountTotal).toBe(10);
    expect(totals.netTotal).toBe(170);
    expect(totals.cashTotal).toBe(100);
    expect(totals.cardTotal).toBe(70);
  });

  it("sums earned points and absolute redeemed points", () => {
    const totals = aggregateVisitTotals([
      visit({ gross: 100, discount: 0, net: 100, payment: "CASH", earn: 100, discountType: "REWARD", redeem: 50 }),
      visit({ gross: 50, discount: 0, net: 50, payment: "CASH", earn: 50, discountType: "CAMPAIGN" }),
    ]);
    expect(totals.pointsEarnedTotal).toBe(150);
    expect(totals.pointsRedeemedTotal).toBe(50);
    expect(totals.rewardRedemptionsCount).toBe(1);
    expect(totals.campaignRedemptionsCount).toBe(1);
  });
});
