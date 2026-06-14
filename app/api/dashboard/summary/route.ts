import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getDashboardSummary } from "@/lib/reports/dashboard-reports";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;

  const summary = await getDashboardSummary(prisma);
  return NextResponse.json({ summary });
}
