import type { Prisma } from "@prisma/client";

export type VisitWithLoyalty = Prisma.VisitGetPayload<{
  include: { loyaltyTransactions: true };
}>;

export type VisitTotals = {
  visitsCount: number;
  grossTotal: number;
  discountTotal: number;
  netTotal: number;
  cashTotal: number;
  cardTotal: number;
  pointsEarnedTotal: number;
  pointsRedeemedTotal: number;
  rewardRedemptionsCount: number;
  campaignRedemptionsCount: number;
};

/**
 * مصدر الحقيقة الوحيد لتجميع إجماليات مجموعة زيارات.
 * يُستخدم في جلسة الصندوق والإغلاق اليومي حتى لا تنحرف الأرقام بين الطبقات.
 */
export function aggregateVisitTotals(visits: VisitWithLoyalty[]): VisitTotals {
  return {
    visitsCount: visits.length,
    grossTotal: sum(visits.map((visit) => Number(visit.grossAmount))),
    discountTotal: sum(visits.map((visit) => Number(visit.discountAmount))),
    netTotal: sum(visits.map((visit) => Number(visit.netAmount))),
    cashTotal: sum(visits.filter((visit) => visit.paymentMethod === "CASH").map((visit) => Number(visit.netAmount))),
    cardTotal: sum(visits.filter((visit) => visit.paymentMethod === "NETWORK").map((visit) => Number(visit.netAmount))),
    pointsEarnedTotal: intSum(loyaltyPoints(visits, "EARN")),
    pointsRedeemedTotal: Math.abs(intSum(loyaltyPoints(visits, "REDEEM"))),
    rewardRedemptionsCount: visits.filter((visit) => visit.discountType === "REWARD").length,
    campaignRedemptionsCount: visits.filter((visit) => visit.discountType === "CAMPAIGN").length,
  };
}

function loyaltyPoints(visits: VisitWithLoyalty[], type: "EARN" | "REDEEM") {
  return visits.flatMap((visit) =>
    visit.loyaltyTransactions.filter((transaction) => transaction.type === type).map((transaction) => transaction.points),
  );
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function sum(values: number[]) {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}

function intSum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
