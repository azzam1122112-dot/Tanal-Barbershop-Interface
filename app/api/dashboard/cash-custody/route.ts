import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { getCashCustodyDashboard } from "@/lib/cash-custody/cash-custody-service";
import { prisma } from "@/lib/db/prisma";
import { toErrorResponse } from "@/lib/http/error-response";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  try {
    return NextResponse.json(await getCashCustodyDashboard(prisma, {
      organizationId: session.organizationId,
      salonIds: effectiveSalonIds(session),
    }));
  } catch (error) {
    return toErrorResponse(error, "تعذر تحميل دفتر العهدة");
  }
}
