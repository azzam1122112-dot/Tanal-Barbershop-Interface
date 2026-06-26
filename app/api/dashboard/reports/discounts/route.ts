import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getDiscountReport } from "@/lib/reports/dashboard-reports";
import { getReportFiltersFromUrl } from "@/lib/reports/report-query";

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response || !auth.session) return auth.response ?? NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  const organizationId = auth.session.type === "dashboard" ? auth.session.organizationId : undefined;

  const discounts = await getDiscountReport(prisma, { ...getReportFiltersFromUrl(new URL(request.url)), organizationId });
  return NextResponse.json({ discounts });
}
