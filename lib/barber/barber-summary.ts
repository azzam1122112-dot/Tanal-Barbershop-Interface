import type { Prisma, PrismaClient } from "@prisma/client";
import { getOpenCashSession, calculateCashSessionSnapshot } from "@/lib/cash-sessions/cash-session-service";
import { sumSessionCollections } from "@/lib/cash-custody/cash-custody-service";
import { getRiyadhDayRange } from "@/lib/datetime/riyadh";

type BarberSummaryPrisma = PrismaClient | Prisma.TransactionClient;

export async function getBarberTodaySummary(prisma: BarberSummaryPrisma, barberId: string, date = new Date()) {
  const { from, to } = getRiyadhDayRange(date);
  const todayWhere = {
    barberId,
    status: "COMPLETED" as const,
    visitedAt: { gte: from, lt: to },
  };

  /**
   * **المجاميع بالتجميع والقائمة وحدها محدودة.**
   * كانت الأرقام تُجمع من نفس الاستعلام المحدود بثماني زيارات، فحلاق بتسع زيارات
   * فأكثر يقرأ «صافي اليوم» ناقصًا بينما بطاقة جلسة الصندوق على الشاشة نفسها
   * تعرض الرقم الكامل — رقمان متناقضان أمام من يعدّ درجه بيده.
   */
  const [totalsRow, cashRow, latestVisitRows] = await Promise.all([
    prisma.visit.aggregate({ where: todayWhere, _count: { _all: true }, _sum: { netAmount: true } }),
    prisma.visit.groupBy({ by: ["paymentMethod"], where: todayWhere, _sum: { netAmount: true } }),
    prisma.visit.findMany({
      where: todayWhere,
      include: { customer: true, services: true },
      orderBy: { visitedAt: "desc" },
      take: LATEST_VISITS_LIMIT,
    }),
  ]);

  const netByMethod = new Map(cashRow.map((row) => [row.paymentMethod, Number(row._sum.netAmount ?? 0)]));
  const visitsCount = totalsRow._count._all;
  const netTotal = round(Number(totalsRow._sum.netAmount ?? 0));
  const cashTotal = round(netByMethod.get("CASH") ?? 0);
  const networkTotal = round(netByMethod.get("NETWORK") ?? 0);
  const [openCashSession, custody] = await Promise.all([
    getOpenCashSession(prisma, barberId),
    prisma.barberCashBalance.findUnique({ where: { barberId }, select: { balance: true, isInitialized: true } }),
  ]);
  const [cashSessionTotals, collectionsTotal] = openCashSession
    ? await Promise.all([calculateCashSessionSnapshot(prisma, openCashSession.id), sumSessionCollections(prisma, openCashSession.id)])
    : [null, 0];

  // ما سلّمه الحلاق فعلًا للإدارة: يعيش خارج الجلسة، فيبقى ظاهرًا بعد إغلاقها.
  const collections = await prisma.cashCollection.findMany({
    where: { barberId, reversedAt: null },
    orderBy: { collectedAt: "desc" },
    take: 5,
    select: {
      id: true,
      collectedAmount: true,
      remainingAfter: true,
      collectedAt: true,
      collectedBy: { select: { name: true } },
    },
  });

  return {
    visitsCount,
    cashTotal,
    networkTotal,
    netTotal,
    custodyBalance: Number(custody?.balance ?? 0),
    custodyInitialized: custody?.isInitialized ?? false,
    collections: collections.map((collection) => ({
      id: collection.id,
      amount: Number(collection.collectedAmount),
      remainingAfter: Number(collection.remainingAfter),
      collectedAt: collection.collectedAt.toISOString(),
      collectedByName: collection.collectedBy?.name ?? null,
    })),
    latestVisits: latestVisitRows.map((visit) => ({
      id: visit.id,
      customer: visit.customer
        ? { id: visit.customer.id, name: visit.customer.name, phone: visit.customer.phone }
        : { id: null, name: "عميل زائر", phone: null },
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
          openingCashAmount: Number(openCashSession.openingCashAmount),
          visitsCount: cashSessionTotals?.visitsCount ?? 0,
          cashTotal: cashSessionTotals?.cashTotal ?? 0,
          networkTotal: cashSessionTotals?.cardTotal ?? 0,
          netTotal: cashSessionTotals?.netTotal ?? 0,
          collectionsTotal,
        }
      : null,
  };
}

/** آخر العمليات المعروضة في شاشة الحلاق — عرض فقط، لا يحدّ أي مجموع. */
const LATEST_VISITS_LIMIT = 5;

function round(value: number) {
  return Math.round(value * 100) / 100;
}
