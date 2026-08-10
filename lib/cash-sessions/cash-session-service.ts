import { BusinessError } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import type { AuditActorType, PrismaClient } from "@prisma/client";
import { aggregateVisitTotals, roundMoney } from "@/lib/visits/visit-totals";
import { assertSubscriptionActive } from "@/lib/plans/subscription-guard";
import { sumSessionExpenses } from "@/lib/expenses/expense-service";

type CashSessionPrisma = PrismaClient | Prisma.TransactionClient;

export type CashSessionCloseInput = {
  cashSessionId?: string | null;
  barberId?: string | null;
  closedByUserId?: string | null;
  closedByBarberId?: string | null;
  closedByActorType?: AuditActorType;
  cashReceivedAmount?: number | null;
  notes?: string | null;
  // نطاق الأمان: المؤسسة (عزل المستأجرين) + فروع المشرف المسندة.
  organizationId?: string | null;
  salonIds?: string[];
  auditMeta?: {
    ipAddress?: string | null;
    userAgent?: string | null;
  };
};

export async function getOpenCashSession(prisma: CashSessionPrisma, barberId: string) {
  return prisma.cashSession.findFirst({
    where: { barberId, status: "OPEN" },
    include: { barber: true, closedBy: true },
    orderBy: { openedAt: "desc" },
  });
}

export async function assertOpenCashSession(prisma: CashSessionPrisma, barberId: string) {
  const session = await getOpenCashSession(prisma, barberId);
  if (!session) {
    throw new BusinessError("لا توجد جلسة صندوق مفتوحة لهذا الحلاق");
  }
  return session;
}

export async function openCashSession(
  prisma: PrismaClient,
  input: {
    barberId: string;
    auditMeta?: { ipAddress?: string | null; userAgent?: string | null };
  },
) {
  return runSerializableTransaction(prisma, async (tx) => {
    const barber = await tx.barber.findUnique({ where: { id: input.barberId } });
    if (!barber || !barber.isActive) {
      throw new BusinessError("الحلاق غير موجود أو غير فعال");
    }

    // لا تُفتح جلسة صندوق على اشتراك منتهٍ — نمنع من البداية لا بعد تسجيل الزيارات.
    if (barber.organizationId) {
      await assertSubscriptionActive(tx, barber.organizationId);
    }

    const existing = await getOpenCashSession(tx, input.barberId);
    if (existing) {
      return {
        cashSession: await toCashSessionRow(tx, existing),
        alreadyOpen: true,
      };
    }

    const session = await tx.cashSession.create({
      data: { barberId: input.barberId, organizationId: barber.organizationId, salonId: barber.salonId },
      include: { barber: true, closedBy: true },
    });

    await tx.auditLog.create({
      data: {
        actorType: "BARBER",
        actorBarberId: input.barberId,
        action: "cash_session.opened",
        entityType: "CashSession",
        entityId: session.id,
        after: { cashSessionId: session.id, barberId: input.barberId, openedAt: session.openedAt.toISOString() },
        ipAddress: input.auditMeta?.ipAddress,
        userAgent: input.auditMeta?.userAgent,
      },
    });

    return {
      cashSession: await toCashSessionRow(tx, session),
      alreadyOpen: false,
    };
  });
}

export async function closeCashSession(prisma: PrismaClient, input: CashSessionCloseInput) {
  return runSerializableTransaction(prisma, async (tx) => {
    const session = await tx.cashSession.findFirst({
      where: {
        status: "OPEN",
        // عزل المؤسسة + قصر المشرف على فروعه المسندة.
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.salonIds && input.salonIds.length ? { salonId: { in: input.salonIds } } : {}),
        ...(input.cashSessionId ? { id: input.cashSessionId } : {}),
        ...(input.barberId ? { barberId: input.barberId } : {}),
      },
      include: { barber: true, closedBy: true },
      orderBy: { openedAt: "desc" },
    });

    if (!session) {
      throw new BusinessError("لا توجد جلسة صندوق مفتوحة للإغلاق");
    }

    const totals = await calculateCashSessionSnapshot(tx, session.id);
    // الكاش المتوقع في الدرج = مقبوضات الكاش ناقص ما صُرف منه نثريًا.
    const expensesTotal = await sumSessionExpenses(tx, session.id);
    const expectedCash = roundMoney(totals.cashTotal - expensesTotal);
    const cashReceivedAmount = input.cashReceivedAmount ?? expectedCash;
    const close = await tx.cashSession.update({
      where: { id: session.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        expensesTotal,
        ...(input.closedByUserId ? { closedByUserId: input.closedByUserId } : {}),
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
        notes: input.notes,
      },
      include: { barber: true, closedBy: true },
    });

    await tx.auditLog.create({
      data: {
        actorType: input.closedByActorType ?? "ADMIN",
        actorUserId: input.closedByUserId,
        actorBarberId: input.closedByBarberId,
        action: "cash_session.closed",
        entityType: "CashSession",
        entityId: close.id,
        after: {
          ...toStoredCashSessionRow(close),
          expensesTotal,
          expectedCash,
          cashDifference: roundMoney(cashReceivedAmount - expectedCash),
        },
        ipAddress: input.auditMeta?.ipAddress,
        userAgent: input.auditMeta?.userAgent,
      },
    });

    return toStoredCashSessionRow(close);
  });
}

export async function getCashSessionSummary(prisma: CashSessionPrisma, organizationId?: string, salonIds?: string[] | null) {
  const scopeFilter = {
    ...(organizationId ? { organizationId } : {}),
    ...(salonIds && salonIds.length > 0 ? { salonId: { in: salonIds } } : {}),
  };
  const [barbers, openSessions] = await Promise.all([
    prisma.barber.findMany({ where: { isActive: true, ...scopeFilter }, orderBy: { name: "asc" } }),
    prisma.cashSession.findMany({
      where: { status: "OPEN", ...scopeFilter },
      include: { barber: true, closedBy: true },
      orderBy: { openedAt: "asc" },
    }),
  ]);
  const openByBarber = new Map(openSessions.map((session) => [session.barberId, session]));

  // لقطة واحدة لكل الزيارات وتجميع واحد لكل المصروفات بدل استعلامين إضافيين
  // لكل جلسة مفتوحة. عدد الاستعلامات الآن ثابت مهما كبر الفريق.
  const openSessionIds = openSessions.map((session) => session.id);
  const [openVisits, expenseGroups] = openSessionIds.length > 0
    ? await Promise.all([
        prisma.visit.findMany({
          where: { cashSessionId: { in: openSessionIds }, status: "COMPLETED" },
          include: { loyaltyTransactions: true },
        }),
        prisma.cashExpense.groupBy({
          by: ["cashSessionId"],
          where: { cashSessionId: { in: openSessionIds } },
          _sum: { amount: true },
        }),
      ])
    : [[], []];
  const visitsBySession = new Map<string, typeof openVisits>();
  for (const visit of openVisits) {
    if (!visit.cashSessionId) continue;
    const rows = visitsBySession.get(visit.cashSessionId) ?? [];
    rows.push(visit);
    visitsBySession.set(visit.cashSessionId, rows);
  }
  const expensesBySession = new Map(
    expenseGroups
      .filter((row) => row.cashSessionId)
      .map((row) => [row.cashSessionId!, Number(row._sum.amount ?? 0)]),
  );
  const openRowEntries = openSessions.map((session) => [
    session.barberId,
    toCashSessionRowFromTotals(
      session,
      aggregateVisitTotals(visitsBySession.get(session.id) ?? []),
      expensesBySession.get(session.id) ?? 0,
    ),
  ] as const);
  const openRowByBarber = new Map(openRowEntries);

  return barbers.map((barber) => {
    const hasOpenSession = openByBarber.has(barber.id);
    return {
      barberId: barber.id,
      barberName: barber.name,
      status: hasOpenSession ? ("OPEN" as const) : ("CLOSED" as const),
      openSession: openRowByBarber.get(barber.id) ?? null,
    };
  });
}

export async function getCashSessionHistory(prisma: CashSessionPrisma, filters: { organizationId?: string | null; salonIds?: string[] | null; from?: Date | string | null; to?: Date | string | null; barberId?: string | null } = {}) {
  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? endOfDay(filters.to) : undefined;
  const sessions = await prisma.cashSession.findMany({
    where: {
      status: "CLOSED",
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      ...(filters.salonIds && filters.salonIds.length > 0 ? { salonId: { in: filters.salonIds } } : {}),
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
      ...(from || to ? { closedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    },
    include: { barber: true, closedBy: true },
    orderBy: [{ closedAt: "desc" }, { openedAt: "desc" }],
    take: 100,
  });

  return sessions.map(toStoredCashSessionRow);
}

export async function calculateCashSessionSnapshot(prisma: CashSessionPrisma, cashSessionId: string) {
  const visits = await prisma.visit.findMany({
    where: {
      cashSessionId,
      status: "COMPLETED",
    },
    include: { loyaltyTransactions: true },
  });

  return aggregateVisitTotals(visits);
}

async function toCashSessionRow(
  prisma: CashSessionPrisma,
  session: Prisma.CashSessionGetPayload<{ include: { barber: true; closedBy: true } }>,
) {
  const totals = session.status === "OPEN" ? await calculateCashSessionSnapshot(prisma, session.id) : storedTotals(session);
  // الجلسة المفتوحة تُحسب مصروفاتها لحظيًا؛ المغلقة تعتمد اللقطة المحفوظة.
  const expensesTotal =
    session.status === "OPEN" ? await sumSessionExpenses(prisma, session.id) : Number(session.expensesTotal);
  return toCashSessionRowFromTotals(session, totals, expensesTotal);
}

function toCashSessionRowFromTotals(
  session: Prisma.CashSessionGetPayload<{ include: { barber: true; closedBy: true } }>,
  totals: ReturnType<typeof aggregateVisitTotals>,
  expensesTotal: number,
) {
  const expectedCash = roundMoney(totals.cashTotal - expensesTotal);
  return {
    id: session.id,
    barber: { id: session.barber.id, name: session.barber.name },
    status: session.status,
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    closedBy: session.closedBy ? { id: session.closedBy.id, name: session.closedBy.name } : null,
    ...totals,
    expensesTotal,
    expectedCash,
    cashReceivedAmount: session.cashReceivedAmount ? Number(session.cashReceivedAmount) : null,
    cashDifference: session.cashReceivedAmount ? roundMoney(Number(session.cashReceivedAmount) - expectedCash) : null,
    notes: session.notes,
  };
}

function toStoredCashSessionRow(session: Prisma.CashSessionGetPayload<{ include: { barber: true; closedBy: true } }>) {
  const totals = storedTotals(session);
  const expensesTotal = Number(session.expensesTotal);
  const expectedCash = roundMoney(totals.cashTotal - expensesTotal);
  const cashReceivedAmount = session.cashReceivedAmount ? Number(session.cashReceivedAmount) : expectedCash;
  return {
    id: session.id,
    barber: { id: session.barber.id, name: session.barber.name },
    status: session.status,
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    closedBy: session.closedBy ? { id: session.closedBy.id, name: session.closedBy.name } : null,
    ...totals,
    expensesTotal,
    expectedCash,
    cashReceivedAmount,
    cashDifference: roundMoney(cashReceivedAmount - expectedCash),
    notes: session.notes,
  };
}

function storedTotals(session: Prisma.CashSessionGetPayload<{ include: { barber: true; closedBy: true } }>) {
  return {
    visitsCount: session.visitsCount,
    grossTotal: Number(session.grossTotal),
    discountTotal: Number(session.discountTotal),
    netTotal: Number(session.netTotal),
    cashTotal: Number(session.cashTotal),
    cardTotal: Number(session.cardTotal),
    pointsEarnedTotal: session.pointsEarnedTotal,
    pointsRedeemedTotal: session.pointsRedeemedTotal,
    rewardRedemptionsCount: session.rewardRedemptionsCount,
    campaignRedemptionsCount: session.campaignRedemptionsCount,
  };
}

function endOfDay(date: Date | string) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return next;
}

async function runSerializableTransaction<T>(prisma: PrismaClient, callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isSerializableWriteConflict(error) || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
  throw new BusinessError("تعذر تنفيذ عملية جلسة الصندوق بعد عدة محاولات");
}

function isSerializableWriteConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
