import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { getCashSessionSummary } from "@/lib/cash-sessions/cash-session-service";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;

  const summary = await getCashSessionSummary(prisma);
  return NextResponse.json({ summary });
}
