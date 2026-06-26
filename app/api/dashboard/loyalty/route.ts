import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireDashboardApi } from "@/lib/auth/http";
import { toSafeRewardRule } from "@/lib/loyalty/reward-summary";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const [settings, rewardRules] = await Promise.all([
    session.salonId ? prisma.systemSettings.findFirst({ where: { salonId: session.salonId } }) : prisma.systemSettings.findFirst({ where: { organizationId: session.organizationId } }),
    prisma.rewardRule.findMany({ where: { organizationId: session.organizationId }, orderBy: [{ sortOrder: "asc" }, { requiredPoints: "asc" }] }),
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
