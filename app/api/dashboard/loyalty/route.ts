import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireDashboardApi } from "@/lib/auth/http";
import { toSafeRewardRule } from "@/lib/loyalty/reward-summary";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;

  const [settings, rewardRules] = await Promise.all([
    prisma.systemSettings.findUnique({ where: { singletonKey: "default" } }),
    prisma.rewardRule.findMany({ orderBy: [{ sortOrder: "asc" }, { requiredPoints: "asc" }] }),
  ]);

  return NextResponse.json({
    settings: settings
      ? {
          salonName: settings.salonName,
          currency: settings.currency,
          pointsPerCurrencyUnit: Number(settings.pointsPerCurrencyUnit),
          pointsCalculatedAfterDiscount: settings.pointsCalculatedAfterDiscount,
          allowMultipleDiscounts: settings.allowMultipleDiscounts,
        }
      : null,
    rewardRules: rewardRules.map(toSafeRewardRule),
  });
}
