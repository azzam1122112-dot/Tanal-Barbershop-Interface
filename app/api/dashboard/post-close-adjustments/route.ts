import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getPostCloseAdjustmentReport } from "@/lib/post-close-adjustments/post-close-adjustment-report";

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const report = await getPostCloseAdjustmentReport(prisma, {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    barberId: url.searchParams.get("barberId"),
    adjustmentType: parseAdjustmentType(url.searchParams.get("adjustmentType")),
  });

  return NextResponse.json(report);
}

function parseAdjustmentType(value: string | null) {
  if (value === "VISIT_CANCELLED" || value === "VISIT_PAYMENT_METHOD_UPDATED" || value === "VISIT_AMOUNT_UPDATED") {
    return value;
  }
  return undefined;
}
