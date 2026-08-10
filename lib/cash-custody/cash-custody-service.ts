import {
  CashCollectionScheduleMode,
  CashCustodyMovementType,
  Prisma,
  type AuditActorType,
  type PrismaClient,
} from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import {
  addRiyadhDays,
  getRiyadhDateParts,
  riyadhDateTimeForDay,
  startOfRiyadhDay,
} from "@/lib/datetime/riyadh";
import { roundMoney } from "@/lib/visits/visit-totals";

type CustodyPrisma = PrismaClient | Prisma.TransactionClient;

export const CUSTODY_MOVEMENT_LABELS: Record<CashCustodyMovementType, string> = {
  OPENING_BALANCE: "تثبيت رصيد افتتاحي",
  CASH_SALE: "بيع نقدي",
  CASH_EXPENSE: "مصروف من الدرج",
  COLLECTION: "تحصيل إلى خزنة الفرع",
  COLLECTION_REVERSAL: "عكس تحصيل",
  VISIT_REVERSAL: "إلغاء بيع نقدي",
  PAYMENT_METHOD_ADJUSTMENT: "تصحيح طريقة الدفع",
  VISIT_AMOUNT_ADJUSTMENT: "تصحيح مبلغ بيع نقدي",
  EXPENSE_REVERSAL: "عكس مصروف",
  COUNT_ADJUSTMENT: "تسوية فرق العد",
  SAFE_OWNER_PICKUP: "تسليم للمالك",
  SAFE_BANK_DEPOSIT: "إيداع بنكي",
};

export type CollectionDueStatus = "UNINITIALIZED" | "CLEAR" | "DUE" | "OVERDUE" | "DISABLED";

export async function recordBarberCashDelta(
  tx: CustodyPrisma,
  input: {
    organizationId: string;
    salonId: string;
    barberId: string;
    cashSessionId?: string | null;
    amount: number;
    type: CashCustodyMovementType;
    referenceKey: string;
    referenceId?: string | null;
    note?: string | null;
    actorType?: AuditActorType;
    actorUserId?: string | null;
    actorBarberId?: string | null;
  },
) {
  const delta = roundMoney(input.amount);
  if (delta === 0) return null;

  const duplicate = await tx.cashCustodyMovement.findUnique({ where: { referenceKey: input.referenceKey } });
  if (duplicate) return duplicate;

  const account = await tx.barberCashBalance.upsert({
    where: { barberId: input.barberId },
    update: {},
    create: {
      barberId: input.barberId,
      organizationId: input.organizationId,
      salonId: input.salonId,
    },
  });
  const before = Number(account.balance);
  const after = roundMoney(before + delta);
  if (account.isInitialized && after < 0) {
    throw new BusinessError("رصيد عهدة الحلاق لا يكفي لهذه الحركة", 409);
  }

  await tx.barberCashBalance.update({
    where: { barberId: input.barberId },
    data: { balance: after, lastMovementAt: new Date() },
  });
  return tx.cashCustodyMovement.create({
    data: {
      organizationId: input.organizationId,
      salonId: input.salonId,
      barberId: input.barberId,
      cashSessionId: input.cashSessionId ?? null,
      type: input.type,
      amount: Math.abs(delta),
      barberDelta: delta,
      barberBalanceBefore: before,
      barberBalanceAfter: after,
      referenceKey: input.referenceKey,
      referenceId: input.referenceId ?? null,
      note: input.note?.trim() || null,
      actorType: input.actorType ?? "SYSTEM",
      actorUserId: input.actorUserId ?? null,
      actorBarberId: input.actorBarberId ?? null,
    },
  });
}

export async function initializeBarberCashBalance(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    salonId: string;
    barberId: string;
    countedAmount: number;
    note?: string | null;
    actorUserId: string;
    actorType: Extract<AuditActorType, "OWNER" | "ADMIN" | "SUPERVISOR">;
  },
) {
  const countedAmount = roundMoney(input.countedAmount);
  if (countedAmount < 0) throw new BusinessError("الرصيد الفعلي لا يمكن أن يكون سالبًا");

  return runSerializable(prisma, async (tx) => {
    const barber = await tx.barber.findFirst({
      where: { id: input.barberId, organizationId: input.organizationId, salonId: input.salonId, isActive: true },
      select: { id: true },
    });
    if (!barber) throw new BusinessError("الحلاق غير موجود في هذا الفرع", 404);

    const account = await tx.barberCashBalance.upsert({
      where: { barberId: input.barberId },
      update: {},
      create: {
        barberId: input.barberId,
        organizationId: input.organizationId,
        salonId: input.salonId,
      },
    });
    if (account.isInitialized) throw new BusinessError("تم تثبيت عهدة هذا الحلاق مسبقًا", 409);

    const before = Number(account.balance);
    const now = new Date();
    await tx.barberCashBalance.update({
      where: { barberId: input.barberId },
      data: { balance: countedAmount, isInitialized: true, initializedAt: now, lastMovementAt: now },
    });
    await tx.cashCustodyMovement.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        barberId: input.barberId,
        type: "OPENING_BALANCE",
        amount: countedAmount,
        barberDelta: roundMoney(countedAmount - before),
        barberBalanceBefore: before,
        barberBalanceAfter: countedAmount,
        referenceKey: `CUSTODY:OPENING:${input.barberId}`,
        note: input.note?.trim() || "تثبيت أول عد فعلي للعهدة",
        actorType: input.actorType,
        actorUserId: input.actorUserId,
      },
    });
    await writeAudit(tx, input, "cash_custody.initialized", input.barberId, {
      trackedBeforeInitialization: before,
      countedAmount,
    });
    return { barberId: input.barberId, balance: countedAmount, initializedAt: now.toISOString() };
  });
}

export async function collectBarberCash(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    salonId: string;
    barberId: string;
    countedAmount: number;
    collectedAmount: number;
    discrepancyReason?: string | null;
    note?: string | null;
    idempotencyKey: string;
    actorUserId: string;
    actorType: Extract<AuditActorType, "OWNER" | "ADMIN" | "SUPERVISOR">;
  },
) {
  const countedAmount = roundMoney(input.countedAmount);
  const collectedAmount = roundMoney(input.collectedAmount);
  if (countedAmount < 0) throw new BusinessError("المبلغ المعدود لا يمكن أن يكون سالبًا");
  if (!(collectedAmount > 0)) throw new BusinessError("المبلغ المستلم يجب أن يكون أكبر من صفر");
  if (collectedAmount > countedAmount) throw new BusinessError("لا يمكن استلام مبلغ أكبر من الكاش المعدود");

  return runSerializable(prisma, async (tx) => {
    const duplicate = await tx.cashCollection.findUnique({
      where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } },
      include: collectionInclude,
    });
    if (duplicate) return toCollectionRow(duplicate);

    const barber = await tx.barber.findFirst({
      where: { id: input.barberId, organizationId: input.organizationId, salonId: input.salonId, isActive: true },
      select: { id: true, name: true },
    });
    if (!barber) throw new BusinessError("الحلاق غير موجود في هذا الفرع", 404);
    const account = await tx.barberCashBalance.findUnique({ where: { barberId: input.barberId } });
    if (!account?.isInitialized) {
      throw new BusinessError("ثبّت الرصيد الفعلي لعهدة الحلاق قبل أول تحصيل", 409);
    }

    const expectedBefore = roundMoney(Number(account.balance));
    const discrepancyAmount = roundMoney(countedAmount - expectedBefore);
    if (Math.abs(discrepancyAmount) >= 0.01 && !input.discrepancyReason?.trim()) {
      throw new BusinessError("اكتب سبب فرق العد قبل تأكيد التحصيل");
    }

    const remainingAfter = roundMoney(countedAmount - collectedAmount);
    const safe = await tx.branchCashSafe.upsert({
      where: { salonId: input.salonId },
      update: {},
      create: { salonId: input.salonId, organizationId: input.organizationId },
    });
    const branchBefore = Number(safe.balance);
    const branchSafeAfter = roundMoney(branchBefore + collectedAmount);
    const openSession = await tx.cashSession.findFirst({
      where: { barberId: input.barberId, organizationId: input.organizationId, salonId: input.salonId, status: "OPEN" },
      select: { id: true },
      orderBy: { openedAt: "desc" },
    });

    const collection = await tx.cashCollection.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        barberId: input.barberId,
        cashSessionId: openSession?.id ?? null,
        collectedByUserId: input.actorUserId,
        expectedBefore,
        countedAmount,
        discrepancyAmount,
        discrepancyReason: input.discrepancyReason?.trim() || null,
        collectedAmount,
        remainingAfter,
        branchSafeAfter,
        note: input.note?.trim() || null,
        idempotencyKey: input.idempotencyKey,
      },
      include: collectionInclude,
    });

    const now = new Date();
    await tx.barberCashBalance.update({
      where: { barberId: input.barberId },
      data: { balance: remainingAfter, lastMovementAt: now },
    });
    await tx.branchCashSafe.update({
      where: { salonId: input.salonId },
      data: { balance: branchSafeAfter, lastMovementAt: now },
    });

    if (Math.abs(discrepancyAmount) >= 0.01) {
      await tx.cashCustodyMovement.create({
        data: {
          organizationId: input.organizationId,
          salonId: input.salonId,
          barberId: input.barberId,
          cashSessionId: openSession?.id ?? null,
          type: "COUNT_ADJUSTMENT",
          amount: Math.abs(discrepancyAmount),
          barberDelta: discrepancyAmount,
          barberBalanceBefore: expectedBefore,
          barberBalanceAfter: countedAmount,
          referenceKey: `COLLECTION:COUNT:${collection.id}`,
          referenceId: collection.id,
          note: input.discrepancyReason!.trim(),
          actorType: input.actorType,
          actorUserId: input.actorUserId,
        },
      });
    }
    await tx.cashCustodyMovement.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        barberId: input.barberId,
        cashSessionId: openSession?.id ?? null,
        type: "COLLECTION",
        amount: collectedAmount,
        barberDelta: -collectedAmount,
        branchDelta: collectedAmount,
        barberBalanceBefore: countedAmount,
        barberBalanceAfter: remainingAfter,
        branchBalanceBefore: branchBefore,
        branchBalanceAfter: branchSafeAfter,
        referenceKey: `COLLECTION:${collection.id}`,
        referenceId: collection.id,
        note: input.note?.trim() || `تحصيل من ${barber.name}`,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
      },
    });
    await writeAudit(tx, input, "cash_collection.confirmed", collection.id, {
      barberId: input.barberId,
      expectedBefore,
      countedAmount,
      discrepancyAmount,
      collectedAmount,
      remainingAfter,
      branchSafeAfter,
    });
    return toCollectionRow(collection);
  });
}

export async function reverseCashCollection(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    salonIds?: string[] | null;
    collectionId: string;
    reason: string;
    actorUserId: string;
    actorType: Extract<AuditActorType, "OWNER" | "ADMIN" | "SUPERVISOR">;
  },
) {
  if (input.reason.trim().length < 3) throw new BusinessError("اكتب سبب عكس التحصيل بوضوح");
  return runSerializable(prisma, async (tx) => {
    const collection = await tx.cashCollection.findFirst({
      where: {
        id: input.collectionId,
        organizationId: input.organizationId,
        ...(input.salonIds?.length ? { salonId: { in: input.salonIds } } : {}),
      },
      include: collectionInclude,
    });
    if (!collection) throw new BusinessError("إيصال التحصيل غير موجود", 404);
    if (collection.reversedAt) throw new BusinessError("تم عكس هذا التحصيل مسبقًا", 409);

    const [account, safe] = await Promise.all([
      tx.barberCashBalance.findUniqueOrThrow({ where: { barberId: collection.barberId } }),
      tx.branchCashSafe.findUniqueOrThrow({ where: { salonId: collection.salonId } }),
    ]);
    const amount = Number(collection.collectedAmount);
    const barberBefore = Number(account.balance);
    const branchBefore = Number(safe.balance);
    if (branchBefore < amount) throw new BusinessError("رصيد خزنة الفرع لا يكفي لعكس هذا التحصيل", 409);
    const barberAfter = roundMoney(barberBefore + amount);
    const branchAfter = roundMoney(branchBefore - amount);
    const now = new Date();

    const reversed = await tx.cashCollection.update({
      where: { id: collection.id },
      data: { reversedAt: now, reversedByUserId: input.actorUserId, reversalReason: input.reason.trim() },
      include: collectionInclude,
    });
    await tx.barberCashBalance.update({ where: { barberId: collection.barberId }, data: { balance: barberAfter, lastMovementAt: now } });
    await tx.branchCashSafe.update({ where: { salonId: collection.salonId }, data: { balance: branchAfter, lastMovementAt: now } });
    await tx.cashCustodyMovement.create({
      data: {
        organizationId: collection.organizationId,
        salonId: collection.salonId,
        barberId: collection.barberId,
        cashSessionId: collection.cashSessionId,
        type: "COLLECTION_REVERSAL",
        amount,
        barberDelta: amount,
        branchDelta: -amount,
        barberBalanceBefore: barberBefore,
        barberBalanceAfter: barberAfter,
        branchBalanceBefore: branchBefore,
        branchBalanceAfter: branchAfter,
        referenceKey: `COLLECTION:REVERSAL:${collection.id}`,
        referenceId: collection.id,
        note: input.reason.trim(),
        actorType: input.actorType,
        actorUserId: input.actorUserId,
      },
    });
    await writeAudit(tx, input, "cash_collection.reversed", collection.id, { reason: input.reason, amount, barberAfter, branchAfter });
    return toCollectionRow(reversed);
  });
}

export async function withdrawBranchSafe(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    salonId: string;
    type: "OWNER_PICKUP" | "BANK_DEPOSIT";
    amount: number;
    note: string;
    actorUserId: string;
    actorType: Extract<AuditActorType, "OWNER" | "ADMIN" | "SUPERVISOR">;
    idempotencyKey: string;
  },
) {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new BusinessError("مبلغ السحب يجب أن يكون أكبر من صفر");
  if (input.note.trim().length < 3) throw new BusinessError("اكتب مرجع أو سبب السحب");
  return runSerializable(prisma, async (tx) => {
    const referenceKey = `SAFE:${input.idempotencyKey}`;
    const duplicate = await tx.cashCustodyMovement.findUnique({ where: { referenceKey } });
    if (duplicate) return toMovementRow(duplicate);
    const safe = await tx.branchCashSafe.upsert({
      where: { salonId: input.salonId },
      update: {},
      create: { salonId: input.salonId, organizationId: input.organizationId },
    });
    const before = Number(safe.balance);
    if (before < amount) throw new BusinessError("رصيد خزنة الفرع لا يكفي", 409);
    const after = roundMoney(before - amount);
    const now = new Date();
    await tx.branchCashSafe.update({ where: { salonId: input.salonId }, data: { balance: after, lastMovementAt: now } });
    const movement = await tx.cashCustodyMovement.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        type: input.type === "OWNER_PICKUP" ? "SAFE_OWNER_PICKUP" : "SAFE_BANK_DEPOSIT",
        amount,
        branchDelta: -amount,
        branchBalanceBefore: before,
        branchBalanceAfter: after,
        referenceKey,
        note: input.note.trim(),
        actorType: input.actorType,
        actorUserId: input.actorUserId,
      },
    });
    await writeAudit(tx, input, "branch_cash_safe.withdrawn", movement.id, { type: input.type, amount, before, after });
    return toMovementRow(movement);
  });
}

export async function updateCashCollectionPolicy(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    salonId: string;
    mode: CashCollectionScheduleMode;
    intervalDays?: number;
    weekdays?: number[];
    thresholdAmount?: number | null;
    reminderHour?: number;
    actorUserId: string;
    actorType: Extract<AuditActorType, "OWNER" | "ADMIN" | "SUPERVISOR">;
  },
) {
  const intervalDays = Math.trunc(input.intervalDays ?? 1);
  const weekdays = [...new Set(input.weekdays ?? [])].sort();
  const thresholdAmount = input.thresholdAmount == null ? null : roundMoney(input.thresholdAmount);
  const reminderHour = Math.trunc(input.reminderHour ?? 17);
  if (intervalDays < 1 || intervalDays > 30) throw new BusinessError("الفاصل يجب أن يكون بين يوم و30 يومًا");
  if (weekdays.some((day) => day < 0 || day > 6)) throw new BusinessError("أيام التحصيل غير صحيحة");
  if (input.mode === "WEEKDAYS" && weekdays.length === 0) throw new BusinessError("اختر يوم تحصيل واحدًا على الأقل");
  if (thresholdAmount != null && thresholdAmount <= 0) throw new BusinessError("حد التنبيه يجب أن يكون أكبر من صفر");
  if (reminderHour < 0 || reminderHour > 23) throw new BusinessError("ساعة التذكير غير صحيحة");

  const policy = await prisma.cashCollectionPolicy.upsert({
    where: { salonId: input.salonId },
    update: { mode: input.mode, intervalDays, weekdays, thresholdAmount, reminderHour },
    create: { organizationId: input.organizationId, salonId: input.salonId, mode: input.mode, intervalDays, weekdays, thresholdAmount, reminderHour },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      salonId: input.salonId,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      action: "cash_collection.policy_updated",
      entityType: "CashCollectionPolicy",
      entityId: input.salonId,
      after: { mode: policy.mode, intervalDays: policy.intervalDays, weekdays: policy.weekdays, thresholdAmount: Number(policy.thresholdAmount ?? 0), reminderHour },
    },
  });
  return toPolicyRow(policy);
}

export async function getCashCustodyDashboard(
  prisma: PrismaClient,
  scope: { organizationId: string; salonIds?: string[] | null },
  now = new Date(),
) {
  const salonFilter = scope.salonIds?.length ? { id: { in: scope.salonIds } } : {};
  const salons = await prisma.salon.findMany({
    where: { organizationId: scope.organizationId, isActive: true, ...salonFilter },
    select: {
      id: true,
      name: true,
      branchCashSafe: true,
      cashCollectionPolicy: true,
      barbers: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          cashBalance: true,
          cashCollections: { where: { reversedAt: null }, orderBy: { collectedAt: "desc" }, take: 1, select: { collectedAt: true } },
          cashSessions: { where: { status: "OPEN" }, orderBy: { openedAt: "desc" }, take: 1, select: { id: true, openedAt: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const [collections, movements] = await Promise.all([
    prisma.cashCollection.findMany({
      where: {
        organizationId: scope.organizationId,
        ...(scope.salonIds?.length ? { salonId: { in: scope.salonIds } } : {}),
      },
      include: collectionInclude,
      orderBy: { collectedAt: "desc" },
      take: 80,
    }),
    prisma.cashCustodyMovement.findMany({
      where: {
        organizationId: scope.organizationId,
        ...(scope.salonIds?.length ? { salonId: { in: scope.salonIds } } : {}),
        type: { in: ["SAFE_OWNER_PICKUP", "SAFE_BANK_DEPOSIT"] },
      },
      include: { salon: { select: { name: true } } },
      orderBy: { occurredAt: "desc" },
      take: 40,
    }),
  ]);

  const salonRows = salons.map((salon) => {
    const policy = salon.cashCollectionPolicy ? toPolicyRow(salon.cashCollectionPolicy) : defaultPolicy(salon.id);
    const barbers = salon.barbers.map((barber) => {
      const balance = Number(barber.cashBalance?.balance ?? 0);
      const isInitialized = barber.cashBalance?.isInitialized ?? false;
      const lastCollectionAt = barber.cashCollections[0]?.collectedAt ?? null;
      const due = calculateCollectionDue({
        isInitialized,
        balance,
        initializedAt: barber.cashBalance?.initializedAt ?? null,
        lastCollectionAt,
        policy,
        now,
      });
      return {
        id: barber.id,
        name: barber.name,
        balance,
        isInitialized,
        initializedAt: barber.cashBalance?.initializedAt?.toISOString() ?? null,
        lastMovementAt: barber.cashBalance?.lastMovementAt?.toISOString() ?? null,
        lastCollectionAt: lastCollectionAt?.toISOString() ?? null,
        openCashSessionId: barber.cashSessions[0]?.id ?? null,
        openCashSessionAt: barber.cashSessions[0]?.openedAt.toISOString() ?? null,
        ...due,
      };
    });
    return {
      id: salon.id,
      name: salon.name,
      safeBalance: Number(salon.branchCashSafe?.balance ?? 0),
      safeLastMovementAt: salon.branchCashSafe?.lastMovementAt?.toISOString() ?? null,
      policy,
      barbers,
      barberCustodyTotal: roundMoney(barbers.reduce((sum, barber) => sum + barber.balance, 0)),
    };
  });
  return {
    salons: salonRows,
    collections: collections.map(toCollectionRow),
    safeWithdrawals: movements.map(toMovementRow),
    totals: {
      barberCustody: roundMoney(salonRows.reduce((sum, salon) => sum + salon.barberCustodyTotal, 0)),
      branchSafes: roundMoney(salonRows.reduce((sum, salon) => sum + salon.safeBalance, 0)),
      uninitializedBarbers: salonRows.reduce((sum, salon) => sum + salon.barbers.filter((barber) => !barber.isInitialized).length, 0),
      dueBarbers: salonRows.reduce((sum, salon) => sum + salon.barbers.filter((barber) => barber.dueStatus === "DUE" || barber.dueStatus === "OVERDUE").length, 0),
    },
  };
}

export function calculateCollectionDue(input: {
  isInitialized: boolean;
  balance: number;
  initializedAt: Date | string | null;
  lastCollectionAt: Date | string | null;
  policy: ReturnType<typeof defaultPolicy>;
  now?: Date;
}): { dueStatus: CollectionDueStatus; dueAt: string | null; dueReason: string } {
  const now = input.now ?? new Date();
  if (!input.isInitialized) return { dueStatus: "UNINITIALIZED", dueAt: null, dueReason: "يلزم تثبيت أول رصيد فعلي" };
  if (input.balance <= 0) return { dueStatus: "CLEAR", dueAt: null, dueReason: "لا يوجد كاش للتحصيل" };
  if (input.policy.thresholdAmount != null && input.balance >= input.policy.thresholdAmount) {
    return { dueStatus: "DUE", dueAt: now.toISOString(), dueReason: `بلغ الرصيد حد التنبيه ${input.policy.thresholdAmount}` };
  }
  if (input.policy.mode === "DISABLED") return { dueStatus: "DISABLED", dueAt: null, dueReason: "التذكير الدوري متوقف" };

  const base = input.lastCollectionAt ? new Date(input.lastCollectionAt) : input.initializedAt ? new Date(input.initializedAt) : null;
  if (input.policy.mode === "INTERVAL") {
    if (!base) return { dueStatus: "DUE", dueAt: now.toISOString(), dueReason: "لم يُسجل تحصيل سابق" };
    const dueAt = riyadhDateTimeForDay(addRiyadhDays(base, input.policy.intervalDays), input.policy.reminderHour * 60);
    if (now >= dueAt) {
      const overdue = now.getTime() - dueAt.getTime() >= 24 * 60 * 60 * 1000;
      return { dueStatus: overdue ? "OVERDUE" : "DUE", dueAt: dueAt.toISOString(), dueReason: `موعد التحصيل كل ${input.policy.intervalDays} يوم` };
    }
    return { dueStatus: "CLEAR", dueAt: dueAt.toISOString(), dueReason: "لم يحن موعد التحصيل" };
  }

  const startToday = startOfRiyadhDay(now);
  const nowParts = getRiyadhDateParts(now);
  const collectedToday = Boolean(base && base >= startToday);
  const scheduledToday = input.policy.weekdays.includes(nowParts.weekday);
  if (scheduledToday && !collectedToday && nowParts.hour >= input.policy.reminderHour) {
    return { dueStatus: "DUE", dueAt: now.toISOString(), dueReason: "اليوم ضمن أيام التحصيل المحددة" };
  }
  return { dueStatus: "CLEAR", dueAt: nextWeekdayDue(now, input.policy.weekdays, input.policy.reminderHour).toISOString(), dueReason: "ليس موعد التحصيل الآن" };
}

export async function sumSessionCollections(prisma: CustodyPrisma, cashSessionId: string) {
  const result = await prisma.cashCollection.aggregate({
    where: { cashSessionId, reversedAt: null },
    _sum: { collectedAmount: true },
  });
  return roundMoney(Number(result._sum.collectedAmount ?? 0));
}

function defaultPolicy(salonId: string): { salonId: string; mode: CashCollectionScheduleMode; intervalDays: number; weekdays: number[]; thresholdAmount: number | null; reminderHour: number } {
  return { salonId, mode: CashCollectionScheduleMode.DISABLED, intervalDays: 1, weekdays: [] as number[], thresholdAmount: null as number | null, reminderHour: 17 };
}

function toPolicyRow(policy: { salonId: string; mode: CashCollectionScheduleMode; intervalDays: number; weekdays: number[]; thresholdAmount: Prisma.Decimal | number | null; reminderHour: number }) {
  return { salonId: policy.salonId, mode: policy.mode, intervalDays: policy.intervalDays, weekdays: policy.weekdays, thresholdAmount: policy.thresholdAmount == null ? null : Number(policy.thresholdAmount), reminderHour: policy.reminderHour };
}

const collectionInclude = {
  salon: { select: { id: true, name: true } },
  barber: { select: { id: true, name: true } },
  collectedBy: { select: { id: true, name: true } },
  reversedBy: { select: { id: true, name: true } },
} satisfies Prisma.CashCollectionInclude;

function toCollectionRow(collection: Prisma.CashCollectionGetPayload<{ include: typeof collectionInclude }>) {
  return {
    id: collection.id,
    salon: collection.salon,
    barber: collection.barber,
    cashSessionId: collection.cashSessionId,
    expectedBefore: Number(collection.expectedBefore),
    countedAmount: Number(collection.countedAmount),
    discrepancyAmount: Number(collection.discrepancyAmount),
    discrepancyReason: collection.discrepancyReason,
    collectedAmount: Number(collection.collectedAmount),
    remainingAfter: Number(collection.remainingAfter),
    branchSafeAfter: Number(collection.branchSafeAfter),
    note: collection.note,
    collectedBy: collection.collectedBy,
    collectedAt: collection.collectedAt.toISOString(),
    reversedAt: collection.reversedAt?.toISOString() ?? null,
    reversedBy: collection.reversedBy,
    reversalReason: collection.reversalReason,
  };
}

function toMovementRow(movement: { id: string; salonId: string; type: CashCustodyMovementType; amount: Prisma.Decimal | number; branchBalanceBefore: Prisma.Decimal | number | null; branchBalanceAfter: Prisma.Decimal | number | null; note: string | null; occurredAt: Date; salon?: { name: string } }) {
  return {
    id: movement.id,
    salonId: movement.salonId,
    salonName: movement.salon?.name ?? null,
    type: movement.type,
    label: CUSTODY_MOVEMENT_LABELS[movement.type],
    amount: Number(movement.amount),
    branchBalanceBefore: movement.branchBalanceBefore == null ? null : Number(movement.branchBalanceBefore),
    branchBalanceAfter: movement.branchBalanceAfter == null ? null : Number(movement.branchBalanceAfter),
    note: movement.note,
    occurredAt: movement.occurredAt.toISOString(),
  };
}

function nextWeekdayDue(now: Date, weekdays: number[], hour: number) {
  for (let add = 0; add <= 7; add += 1) {
    const day = addRiyadhDays(now, add);
    const result = riyadhDateTimeForDay(day, hour * 60);
    if (weekdays.includes(getRiyadhDateParts(result).weekday) && result > now) return result;
  }
  return riyadhDateTimeForDay(addRiyadhDays(now, 8), hour * 60);
}

async function writeAudit(
  tx: CustodyPrisma,
  actor: { organizationId: string; salonId?: string; actorUserId: string; actorType: AuditActorType },
  action: string,
  entityId: string,
  after: Record<string, unknown>,
) {
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      salonId: actor.salonId,
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      action,
      entityType: "CashCustody",
      entityId,
      after: JSON.parse(JSON.stringify(after)),
    },
  });
}

async function runSerializable<T>(prisma: PrismaClient, callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 25));
    }
  }
  throw new BusinessError("تعذر تنفيذ حركة العهدة بعد عدة محاولات");
}
