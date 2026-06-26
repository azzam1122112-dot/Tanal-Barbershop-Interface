import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { getCashSessionSummary } from "@/lib/cash-sessions/cash-session-service";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const summary = await getCashSessionSummary(prisma, session.organizationId);
  return NextResponse.json({ summary });
}
