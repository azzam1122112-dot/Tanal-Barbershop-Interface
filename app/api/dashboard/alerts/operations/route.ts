import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { getOperationAlerts } from "@/lib/daily-close/operation-alerts";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const url = new URL(request.url);
  const alerts = await getOperationAlerts(prisma, url.searchParams.get("date") ?? new Date(), session.organizationId, session.salonId);
  return NextResponse.json({ alerts });
}
