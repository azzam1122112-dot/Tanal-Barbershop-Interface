import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getDiscountReport } from "@/lib/reports/dashboard-reports";
import { getReportFiltersFromUrl } from "@/lib/reports/report-query";

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;

  const discounts = await getDiscountReport(prisma, getReportFiltersFromUrl(new URL(request.url)));
  return NextResponse.json({ discounts });
}
