import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { getDailyCloseSummary } from "@/lib/daily-close/daily-close-service";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? new Date().toISOString();
  const summary = await getDailyCloseSummary(prisma, date, session.organizationId);
  return NextResponse.json({ summary });
}
