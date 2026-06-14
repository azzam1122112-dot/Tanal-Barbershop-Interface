import { Prisma } from "@prisma/client";
import type { AuditActorType, PrismaClient } from "@prisma/client";

type DailyClosePrisma = PrismaClient | Prisma.TransactionClient;

type CloseVisit = Prisma.VisitGetPayload<{
  include: { loyaltyTransactions: true };
}>;

export type DailyCloseInput = {
  barberId: string;
  date: Date | string;
  receivedByUserId: string;
  receivedByActorType?: AuditActorType;
  cashReceivedAmount?: number | null;
  notes?: string | null;
  auditMeta?: {
    ipAddress?: string | null;
    userAgent?: string | null;
  };
};

export function normalizeCloseDate(date: Date | string) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

export function getCloseDateRange(date: Date | string) {
  const from = normalizeCloseDate(date);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

export async function getDailyCloseSummary(prisma: DailyClosePrisma, date: Date | string = new Date()) {
  const closeDate = normalizeCloseDate(date);
  const [barbers, closes] = await Promise.all([
    prisma.barber.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.dailyClose.findMany({
      where: { date: closeDate },
      include: { barber: true, receivedBy: true },
    }),
  ]);
  const closeByBarber = new Map(closes.map((close) => [close.barberId, close]));

  const rows = [];
  for (const barber of barbers) {
    const totals = await calculateDailyCloseSnapshot(prisma, barber.id, closeDate);
    const existingClose = closeByBarber.get(barber.id);
    rows.push({
      barberId: barber.id,
      barberName: barber.name,
      date: closeDate.toISOString(),
      status: existingClose ? "CLOSED" as const : "OPEN" as const,
      ...totals,
      existingClose: existingClose ? toDailyCloseRow(existingClose) : null,
    });
  }

  return rows;
}

export async function closeBarberDay(prisma: PrismaClient, input: DailyCloseInput) {
  const requestedCloseDate = normalizeCloseDate(input.date);
  const existingBeforeTransaction = await prisma.dailyClose.findUnique({
    where: { barberId_date: { barberId: input.barberId, date: requestedCloseDate } },
  });
  if (existingBeforeTransaction) {
    await prisma.auditLog.create({
      data: {
        actorType: input.receivedByActorType ?? "ADMIN",
        actorUserId: input.receivedByUserId,
        action: "daily_close.duplicate_attempt",
        entityType: "DailyClose",
        entityId: existingBeforeTransaction.id,
        after: {
          barberId: input.barberId,
          date: requestedCloseDate.toISOString(),
        },
        ipAddress: input.auditMeta?.ipAddress,
        userAgent: input.auditMeta?.userAgent,
      },
    });
    throw new Error("تم إغلاق هذا اليوم مسبقًا");
  }

  return runSerializableTransaction(prisma, async (tx) => {
    const closeDate = requestedCloseDate;
    const barber = await tx.barber.findUnique({ where: { id: input.barberId } });
    if (!barber) {
      throw new Error("الحلاق غير موجود");
    }

    const existing = await tx.dailyClose.findUnique({
      where: { barberId_date: { barberId: input.barberId, date: closeDate } },
    });
    if (existing) {
      throw new Error("تم إغلاق هذا اليوم مسبقًا");
    }

    const totals = await calculateDailyCloseSnapshot(tx, input.barberId, closeDate);
    const cashReceivedAmount = input.cashReceivedAmount ?? totals.cashTotal;
    const close = await tx.dailyClose.create({
      data: {
        barberId: input.barberId,
        date: closeDate,
        visitsCount: totals.visitsCount,
        grossTotal: totals.grossTotal,
        discountTotal: totals.discountTotal,
        netTotal: totals.netTotal,
        cashTotal: totals.cashTotal,
        cardTotal: totals.cardTotal,
        pointsEarnedTotal: totals.pointsEarnedTotal,
        pointsRedeemedTotal: totals.pointsRedeemedTotal,
        rewardRedemptionsCount: totals.rewardRedemptionsCount,
        campaignRedemptionsCount: totals.campaignRedemptionsCount,
        cashReceivedAmount,
        receivedByUserId: input.receivedByUserId,
        notes: input.notes,
      },
      include: { barber: true, receivedBy: true },
    });

    await tx.auditLog.create({
      data: {
        actorType: input.receivedByActorType ?? "ADMIN",
        actorUserId: input.receivedByUserId,
        action: "daily_close.created",
        entityType: "DailyClose",
        entityId: close.id,
        after: {
          ...toDailyCloseRow(close),
          cashDifference: roundMoney(cashReceivedAmount - totals.cashTotal),
        },
        ipAddress: input.auditMeta?.ipAddress,
        userAgent: input.auditMeta?.userAgent,
      },
    });

    return toDailyCloseRow(close);
  });
}

export async function getDailyCloseHistory(prisma: DailyClosePrisma, filters: { from?: Date | string | null; to?: Date | string | null; barberId?: string | null } = {}) {
  const fallback = getCloseDateRange(new Date());
  const from = filters.from ? normalizeCloseDate(filters.from) : fallback.from;
  const to = filters.to ? getCloseDateRange(filters.to).to : fallback.to;

  const closes = await prisma.dailyClose.findMany({
    where: {
      date: { gte: from, lt: to },
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
    },
    include: { barber: true, receivedBy: true },
    orderBy: [{ date: "desc" }, { receivedAt: "desc" }],
    take: 100,
  });

  return closes.map(toDailyCloseRow);
}

export async function calculateDailyCloseSnapshot(prisma: DailyClosePrisma, barberId: string, date: Date | string) {
  const { from, to } = getCloseDateRange(date);
  const visits = await prisma.visit.findMany({
    where: {
      barberId,
      status: "COMPLETED",
      visitedAt: { gte: from, lt: to },
    },
    include: { loyaltyTransactions: true },
  });

  return buildDailyCloseTotals(visits);
}

function buildDailyCloseTotals(visits: CloseVisit[]) {
  return {
    visitsCount: visits.length,
    grossTotal: sum(visits.map((visit) => Number(visit.grossAmount))),
    discountTotal: sum(visits.map((visit) => Number(visit.discountAmount))),
    netTotal: sum(visits.map((visit) => Number(visit.netAmount))),
    cashTotal: sum(visits.filter((visit) => visit.paymentMethod === "CASH").map((visit) => Number(visit.netAmount))),
    cardTotal: sum(visits.filter((visit) => visit.paymentMethod === "NETWORK").map((visit) => Number(visit.netAmount))),
    pointsEarnedTotal: intSum(visits.flatMap((visit) => visit.loyaltyTransactions.filter((transaction) => transaction.type === "EARN").map((transaction) => transaction.points))),
    pointsRedeemedTotal: Math.abs(
      intSum(visits.flatMap((visit) => visit.loyaltyTransactions.filter((transaction) => transaction.type === "REDEEM").map((transaction) => transaction.points))),
    ),
    rewardRedemptionsCount: visits.filter((visit) => visit.discountType === "REWARD").length,
    campaignRedemptionsCount: visits.filter((visit) => visit.discountType === "CAMPAIGN").length,
  };
}

function toDailyCloseRow(
  close: Prisma.DailyCloseGetPayload<{
    include: { barber?: true; receivedBy: true };
  }>,
) {
  const cashTotal = Number(close.cashTotal);
  const cashReceivedAmount = Number(close.cashReceivedAmount);
  return {
    id: close.id,
    barber: "barber" in close && close.barber ? { id: close.barber.id, name: close.barber.name } : { id: close.barberId, name: "" },
    date: close.date.toISOString(),
    visitsCount: close.visitsCount,
    grossTotal: Number(close.grossTotal),
    discountTotal: Number(close.discountTotal),
    netTotal: Number(close.netTotal),
    cashTotal,
    cardTotal: Number(close.cardTotal),
    pointsEarnedTotal: close.pointsEarnedTotal,
    pointsRedeemedTotal: close.pointsRedeemedTotal,
    rewardRedemptionsCount: close.rewardRedemptionsCount,
    campaignRedemptionsCount: close.campaignRedemptionsCount,
    cashReceivedAmount,
    cashDifference: roundMoney(cashReceivedAmount - cashTotal),
    receivedBy: {
      id: close.receivedBy.id,
      name: close.receivedBy.name,
    },
    receivedAt: close.receivedAt.toISOString(),
    notes: close.notes,
  };
}

function sum(values: number[]) {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}

function intSum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

async function runSerializableTransaction<T>(prisma: PrismaClient, callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isSerializableWriteConflict(error) || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
  throw new Error("تعذر تنفيذ إغلاق اليوم بعد عدة محاولات");
}

function isSerializableWriteConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
