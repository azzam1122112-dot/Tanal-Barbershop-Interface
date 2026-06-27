import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getCustomerReport } from "@/lib/reports/dashboard-reports";
import { getReportFiltersFromUrl } from "@/lib/reports/report-query";

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response || !auth.session) return auth.response ?? NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  const organizationId = auth.session.type === "dashboard" ? auth.session.organizationId : undefined;
  const salonId = auth.session.type === "dashboard" ? auth.session.salonId : undefined;

  const report = await getCustomerReport(prisma, { ...getReportFiltersFromUrl(new URL(request.url)), organizationId, salonId });
  return NextResponse.json(report);
}
