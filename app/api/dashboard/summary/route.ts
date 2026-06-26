import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getDashboardSummary } from "@/lib/reports/dashboard-reports";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response || !auth.session) return auth.response ?? NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const organizationId = auth.session.type === "dashboard" ? auth.session.organizationId : undefined;
  const summary = await getDashboardSummary(prisma, organizationId);
  return NextResponse.json({ summary });
}
