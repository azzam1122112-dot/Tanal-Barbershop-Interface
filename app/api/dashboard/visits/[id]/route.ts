import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireDashboardApi } from "@/lib/auth/http";
import { toVisitDashboardRow } from "@/lib/visits/visit-summary";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const visit = await prisma.visit.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      customer: true,
      barber: true,
      services: true,
      cancelledBy: true,
    },
  });

  if (!visit) {
    return NextResponse.json({ message: "الزيارة غير موجودة" }, { status: 404 });
  }

  return NextResponse.json({ visit: toVisitDashboardRow(visit) });
}
