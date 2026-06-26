import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireDashboardApi } from "@/lib/auth/http";
import { toVisitDashboardRow } from "@/lib/visits/visit-summary";

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const paymentMethod = url.searchParams.get("paymentMethod");
  const barberId = url.searchParams.get("barberId");

  const visits = await prisma.visit.findMany({
    where: {
      organizationId: session.organizationId,
      ...(paymentMethod === "CASH" || paymentMethod === "NETWORK" ? { paymentMethod } : {}),
      ...(barberId ? { barberId } : {}),
      ...(q
        ? {
            OR: [
              { customer: { name: { contains: q, mode: "insensitive" } } },
              { customer: { phone: { contains: q.replace(/^\+/, "") } } },
            ],
          }
        : {}),
    },
    include: {
      customer: true,
      barber: true,
      services: true,
      cancelledBy: true,
    },
    orderBy: { visitedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ visits: visits.map(toVisitDashboardRow) });
}
