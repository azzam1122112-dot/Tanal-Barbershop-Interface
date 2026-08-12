import { BusinessError } from "@/lib/errors";
import { runSerializable } from "@/lib/db/serializable-retry";
import { Prisma } from "@prisma/client";
import type { AuditActorType, PrismaClient } from "@prisma/client";
import { aggregateVisitTotals, roundMoney } from "@/lib/visits/visit-totals";
import { assertSubscriptionActive } from "@/lib/plans/subscription-guard";
import { sumSessionExpenses } from "@/lib/expenses/expense-service";
import { sumSessionCollections } from "@/lib/cash-custody/cash-custody-service";
import { addRiyadhDays, normalizeRiyadhDay } from "@/lib/datetime/riyadh";

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
    openingCashAmount?: number;
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

    const openingCashAmount = roundMoney(input.openingCashAmount ?? 0);
    if (openingCashAmount < 0) throw new BusinessError("عهدة بداية الصندوق لا يمكن أن تكون سالبة");
    const custody = await tx.barberCashBalance.findUnique({ where: { barberId: input.barberId } });
    if (custody?.isInitialized && Math.abs(Number(custody.balance) - openingCashAmount) >= 0.01) {
      throw new BusinessError(`عهدة الحلاق المسجلة ${Number(custody.balance)} ريال؛ طابق مبلغ البداية أو راجع المدير لتسوية الرصيد`, 409);
    }
    const session = await tx.cashSession.create({
      data: { barberId: input.barberId, organizationId: barber.organizationId, salonId: barber.salonId, openingCashAmount },
      include: { barber: true, closedBy: true },
    });

    await tx.auditLog.create({
      data: {
        actorType: "BARBER",
        actorBarberId: input.barberId,
        action: "cash_session.opened",
        entityType: "CashSession",
        entityId: session.id,
        after: { cashSessionId: session.id, barberId: input.barberId, openingCashAmount, openedAt: session.openedAt.toISOString() },
        ipAddress: input.auditMeta?.ipAddress,
        userAgent: input.auditMeta?.userAgent,
      },
    });

    return {
      cashSession: await toCashSessionRow(tx, session),
      alreadyOpen: false,
    };
  }, "cash_session.open");
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
    // الكاش المتوقع = عهدة البداية + مقبوضات الكاش - ما صُرف نقدًا من الدرج.
    const [expensesTotal, collectionsTotal] = await Promise.all([
      sumSessionExpenses(tx, session.id),
      sumSessionCollections(tx, session.id),
    ]);
    const expectedCash = roundMoney(Number(session.openingCashAmount) + totals.cashTotal - expensesTotal - collectionsTotal);
    // «استُلم» تعني أن إنسانًا استلم. الحلاق حين يغلق جلسته يبقى الكاش في يده،
    // فلا نكتب مبلغًا مستلمًا بلا مستلم — التسليم الحقيقي حركة تحصيل مستقلة.
    const cashReceivedAmount = input.cashReceivedAmount ?? (input.closedByUserId ? expectedCash : null);
    const close = await tx.cashSession.update({
      where: { id: session.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        expensesTotal,
        collectionsTotal,
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
          collectionsTotal,
          expectedCash,
          cashDifference: cashReceivedAmount == null ? null : roundMoney(cashReceivedAmount - expectedCash),
        },
        ipAddress: input.auditMeta?.ipAddress,
        userAgent: input.auditMeta?.userAgent,
      },
    });

    return toStoredCashSessionRow(close);
  }, "cash_session.close");
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
  const [openVisits, expenseGroups, collectionGroups] = openSessionIds.length > 0
    ? await Promise.all([
        prisma.visit.findMany({
          where: { cashSessionId: { in: openSessionIds }, status: "COMPLETED" },
          include: { loyaltyTransactions: true },
        }),
        prisma.cashExpense.groupBy({
          by: ["cashSessionId"],
          where: { cashSessionId: { in: openSessionIds }, paymentSource: "CASH_DRAWER" },
          _sum: { amount: true },
        }),
        prisma.cashCollection.groupBy({
          by: ["cashSessionId"],
          where: { cashSessionId: { in: openSessionIds }, reversedAt: null },
          _sum: { collectedAmount: true },
        }),
      ])
    : [[], [], []];
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
  const collectionsBySession = new Map(
    collectionGroups
      .filter((row) => row.cashSessionId)
      .map((row) => [row.cashSessionId!, Number(row._sum.collectedAmount ?? 0)]),
  );
  const openRowEntries = openSessions.map((session) => [
    session.barberId,
    toCashSessionRowFromTotals(
      session,
      aggregateVisitTotals(visitsBySession.get(session.id) ?? []),
      expensesBySession.get(session.id) ?? 0,
      collectionsBySession.get(session.id) ?? 0,
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
  const from = filters.from ? normalizeRiyadhDay(filters.from) : undefined;
  const to = filters.to ? addRiyadhDays(normalizeRiyadhDay(filters.to), 1) : undefined;
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
  const [expensesTotal, collectionsTotal] = session.status === "OPEN"
    ? await Promise.all([sumSessionExpenses(prisma, session.id), sumSessionCollections(prisma, session.id)])
    : [Number(session.expensesTotal), Number(session.collectionsTotal)];
  return toCashSessionRowFromTotals(session, totals, expensesTotal, collectionsTotal);
}

function toCashSessionRowFromTotals(
  session: Prisma.CashSessionGetPayload<{ include: { barber: true; closedBy: true } }>,
  totals: ReturnType<typeof aggregateVisitTotals>,
  expensesTotal: number,
  collectionsTotal: number,
) {
  const openingCashAmount = Number(session.openingCashAmount);
  const expectedCash = roundMoney(openingCashAmount + totals.cashTotal - expensesTotal - collectionsTotal);
  return {
    id: session.id,
    barber: { id: session.barber.id, name: session.barber.name },
    status: session.status,
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    closedBy: session.closedBy ? { id: session.closedBy.id, name: session.closedBy.name } : null,
    ...totals,
    openingCashAmount,
    expensesTotal,
    collectionsTotal,
    expectedCash,
    cashReceivedAmount: session.cashReceivedAmount != null ? Number(session.cashReceivedAmount) : null,
    cashDifference: session.cashReceivedAmount != null ? roundMoney(Number(session.cashReceivedAmount) - expectedCash) : null,
    notes: session.notes,
  };
}

function toStoredCashSessionRow(session: Prisma.CashSessionGetPayload<{ include: { barber: true; closedBy: true } }>) {
  const totals = storedTotals(session);
  const expensesTotal = Number(session.expensesTotal);
  const collectionsTotal = Number(session.collectionsTotal);
  const openingCashAmount = Number(session.openingCashAmount);
  const expectedCash = roundMoney(openingCashAmount + totals.cashTotal - expensesTotal - collectionsTotal);
  // لا نفترض استلامًا لم يحدث: جلسة أغلقها الحلاق نفسه تبقى بلا مبلغ مستلم.
  const cashReceivedAmount = session.cashReceivedAmount != null ? Number(session.cashReceivedAmount) : null;
  return {
    id: session.id,
    barber: { id: session.barber.id, name: session.barber.name },
    status: session.status,
    openedAt: session.openedAt.toISOString(),
    closedAt: session.closedAt?.toISOString() ?? null,
    closedBy: session.closedBy ? { id: session.closedBy.id, name: session.closedBy.name } : null,
    ...totals,
    openingCashAmount,
    expensesTotal,
    collectionsTotal,
    expectedCash,
    cashReceivedAmount,
    cashDifference: cashReceivedAmount == null ? null : roundMoney(cashReceivedAmount - expectedCash),
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

/**
 * جسما `openCashSession` و`closeCashSession` **قاعدة بيانات خالصة**: قراءات
 * وكتابتان (`cashSession` و`auditLog`) ومساعدات حسابية صرفة. لا رسالة ولا نداء
 * خارجي ولا ملف، فإعادة التنفيذ تتراجع كاملة مع المعاملة الملغاة ولا تُنتج أثرًا
 * مكرّرًا. هذا هو شرط تمرير الجسم إلى `runSerializable`.
 *
 * ثلاث محاولات بتراجع خطي 25ms وبلا jitter كانت تستسلم مبكرًا وتُعيد المتعارضين
 * في اللحظة نفسها؛ السياسة الآن موحّدة مع `visit-service` عبر مساعد مشترك.
 */
async function runSerializableTransaction<T>(
  prisma: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  operation = "cash_session.transaction",
) {
  return runSerializable(prisma, operation, callback);
}
