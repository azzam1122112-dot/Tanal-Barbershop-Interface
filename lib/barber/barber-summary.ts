import type { Prisma, PrismaClient } from "@prisma/client";
import { getOpenCashSession, calculateCashSessionSnapshot } from "@/lib/cash-sessions/cash-session-service";

type BarberSummaryPrisma = PrismaClient | Prisma.TransactionClient;

export async function getBarberTodaySummary(prisma: BarberSummaryPrisma, barberId: string, date = new Date()) {
  const from = startOfDay(date);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  const visits = await prisma.visit.findMany({
    where: {
      barberId,
      status: "COMPLETED",
      visitedAt: { gte: from, lt: to },
    },
    include: {
      customer: true,
      services: true,
    },
    orderBy: { visitedAt: "desc" },
    take: 8,
  });

  const cashTotal = sum(visits.filter((visit) => visit.paymentMethod === "CASH").map((visit) => Number(visit.netAmount)));
  const networkTotal = sum(visits.filter((visit) => visit.paymentMethod === "NETWORK").map((visit) => Number(visit.netAmount)));
  const openCashSession = await getOpenCashSession(prisma, barberId);
  const cashSessionTotals = openCashSession ? await calculateCashSessionSnapshot(prisma, openCashSession.id) : null;

  return {
    visitsCount: visits.length,
    cashTotal,
    networkTotal,
    netTotal: sum(visits.map((visit) => Number(visit.netAmount))),
    latestVisits: visits.slice(0, 5).map((visit) => ({
      id: visit.id,
      customer: { id: visit.customer.id, name: visit.customer.name, phone: visit.customer.phone },
      netAmount: Number(visit.netAmount),
      paymentMethod: visit.paymentMethod,
      visitedAt: visit.visitedAt.toISOString(),
      services: visit.services.map((service) => service.serviceName),
    })),
    cashSession: openCashSession
      ? {
          id: openCashSession.id,
          status: openCashSession.status,
          openedAt: openCashSession.openedAt.toISOString(),
          visitsCount: cashSessionTotals?.visitsCount ?? 0,
          cashTotal: cashSessionTotals?.cashTotal ?? 0,
          networkTotal: cashSessionTotals?.cardTotal ?? 0,
          netTotal: cashSessionTotals?.netTotal ?? 0,
        }
      : null,
  };
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function sum(values: number[]) {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}
