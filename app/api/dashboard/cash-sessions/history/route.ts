import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { getCashSessionHistory } from "@/lib/cash-sessions/cash-session-service";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const url = new URL(request.url);
  const history = await getCashSessionHistory(prisma, {
    organizationId: session.organizationId,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    barberId: url.searchParams.get("barberId"),
  });
  return NextResponse.json({ history });
}
