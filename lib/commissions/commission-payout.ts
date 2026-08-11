import { Prisma, type AuditActorType, type CommissionPayoutMethod, type PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { roundMoney } from "@/lib/visits/visit-totals";
import { recordBarberCashDelta } from "@/lib/cash-custody/cash-custody-service";

/**
 * صرف عمولات الحلاقين.
 *
 * **دفتر رصيد جارٍ:** `المتبقي = المستحق من كل الزيارات المكتملة − ما صُرف غير المعكوس`.
 * لا تسوية بالفترة: زيارة تُلغى بعد الصرف أو تُسجَّل متأخرة تكسر أي إقفال شهري،
 * أما الرصيد الجاري فيصحّح نفسه ويسمح برصيد سالب يعني «مدفوع مقدمًا».
 *
 * **الصرف ليس مصروفًا:** ربح المؤسسة يُخصم منه الاستحقاق مرة واحدة وقت الزيارة
 * (`contribution = صافي − عمولات − مصروفات`). تسجيل الصرف مصروفًا يخصمه مرتين.
 * لذلك هذه الحركة تنقل نقدًا فقط ولا تدخل تقارير المصروفات.
 */

type PayoutPrisma = PrismaClient;

export const PAYOUT_METHOD_LABELS: Record<CommissionPayoutMethod, string> = {
  BANK_TRANSFER: "تحويل بنكي",
  CASH_FROM_SAFE: "نقدًا من خزنة الفرع",
  BARBER_CUSTODY_DEDUCTION: "خصمًا من عهدة الحلاق",
  OPENING_SETTLEMENT: "تسوية افتتاحية",
};

export type CommissionLedgerRow = {
  barberId: string;
  barberName: string;
  salonId: string;
  salonName: string;
  isActive: boolean;
  commissionEnabled: boolean;
  /** كل ما استحقه الحلاق منذ أول زيارة مكتملة. */
  accrued: number;
  /** كل ما صُرف له فعلًا (غير معكوس)، بما فيه التسوية الافتتاحية. */
  paid: number;
  /** موجب = له، سالب = مدفوع مقدمًا. */
  outstanding: number;
  lastPaidAt: string | null;
  /** رصيد العهدة النقدية بيده — يحدّ الخصم من العهدة. */
  custodyBalance: number;
  hasOpeningSettlement: boolean;
};

/** دفتر العمولات لكل حلاق في النطاق: مستحق ومدفوع ومتبقٍّ. */
export async function getCommissionLedger(
  prisma: PayoutPrisma,
  scope: { organizationId: string; salonIds?: string[] | null; barberId?: string | null },
): Promise<CommissionLedgerRow[]> {
  const barberWhere: Prisma.BarberWhereInput = {
    organizationId: scope.organizationId,
    ...(scope.salonIds?.length ? { salonId: { in: scope.salonIds } } : {}),
    ...(scope.barberId ? { id: scope.barberId } : {}),
  };

  const barbers = await prisma.barber.findMany({
    where: barberWhere,
    select: {
      id: true,
      name: true,
      salonId: true,
      isActive: true,
      commissionEnabled: true,
      salon: { select: { name: true } },
      cashBalance: { select: { balance: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  if (barbers.length === 0) return [];

  const barberIds = barbers.map((barber) => barber.id);
  /**
   * **الدفتر يجمع حركة الحلاق كلها بلا قيد فرع — عمدًا.** الدَّين على المؤسسة لا
   * على الفرع؛ تقسيمه بالفرع يجعل حلاقًا منقولًا يظهر بدَينين منفصلين فيُصرف له
   * مرتين عن نفس الزيارات. لذلك القيد الأمني هنا هو **من يقرأ الدفتر** (مالك/مدير)
   * لا نطاق الأرقام داخله — انظر بوابة `canPayCommissions` في الصفحة والـ API.
   */
  const [accruedGroups, paidGroups, lastPayouts, openingPayouts] = await Promise.all([
    prisma.visit.groupBy({
      by: ["barberId"],
      where: { barberId: { in: barberIds }, organizationId: scope.organizationId, status: "COMPLETED" },
      _sum: { commissionAmount: true },
    }),
    prisma.commissionPayout.groupBy({
      by: ["barberId"],
      where: { barberId: { in: barberIds }, organizationId: scope.organizationId, reversedAt: null },
      _sum: { amount: true },
    }),
    prisma.commissionPayout.groupBy({
      by: ["barberId"],
      where: { barberId: { in: barberIds }, organizationId: scope.organizationId, reversedAt: null },
      _max: { paidAt: true },
    }),
    prisma.commissionPayout.groupBy({
      by: ["barberId"],
      where: {
        barberId: { in: barberIds },
        organizationId: scope.organizationId,
        reversedAt: null,
        method: "OPENING_SETTLEMENT",
      },
      _count: { _all: true },
    }),
  ]);

  const accruedBy = new Map(accruedGroups.map((row) => [row.barberId, Number(row._sum.commissionAmount ?? 0)]));
  const paidBy = new Map(paidGroups.map((row) => [row.barberId, Number(row._sum.amount ?? 0)]));
  const lastPaidBy = new Map(lastPayouts.map((row) => [row.barberId, row._max.paidAt ?? null]));
  const openingBy = new Set(openingPayouts.filter((row) => row._count._all > 0).map((row) => row.barberId));

  return barbers.map((barber) => {
    const accrued = roundMoney(accruedBy.get(barber.id) ?? 0);
    const paid = roundMoney(paidBy.get(barber.id) ?? 0);
    return {
      barberId: barber.id,
      barberName: barber.name,
      salonId: barber.salonId,
      salonName: barber.salon?.name ?? "",
      isActive: barber.isActive,
      commissionEnabled: barber.commissionEnabled,
      accrued,
      paid,
      outstanding: roundMoney(accrued - paid),
      lastPaidAt: lastPaidBy.get(barber.id)?.toISOString() ?? null,
      custodyBalance: roundMoney(Number(barber.cashBalance?.balance ?? 0)),
      hasOpeningSettlement: openingBy.has(barber.id),
    };
  });
}

/**
 * متبقّي حلاق واحد — للاستخدام في شاشة الحلاق نفسه.
 *
 * `organizationId` **مطبَّق في كل استعلام** لا مُستقبَل ومهمَل. المعرّف يأتي اليوم
 * من جلسة الحلاق فلا خطر حاليًا، لكن معاملًا يَعِد بقيد ولا يفرضه يتحوّل إلى ثغرة
 * عزل مستأجرين صامتة أول مرة يُستدعى بمعرّف من العميل.
 */
export async function getBarberCommissionBalance(
  prisma: PayoutPrisma,
  input: { organizationId: string; barberId: string; take?: number },
) {
  const visitWhere = { barberId: input.barberId, organizationId: input.organizationId, status: "COMPLETED" as const };
  const payoutWhere = { barberId: input.barberId, organizationId: input.organizationId, reversedAt: null };
  const [accrued, paid, payouts] = await Promise.all([
    prisma.visit.aggregate({ where: visitWhere, _sum: { commissionAmount: true } }),
    prisma.commissionPayout.aggregate({ where: payoutWhere, _sum: { amount: true } }),
    prisma.commissionPayout.findMany({
      where: payoutWhere,
      orderBy: { paidAt: "desc" },
      take: input.take ?? 5,
      select: { id: true, amount: true, method: true, paidAt: true, paidBy: { select: { name: true } } },
    }),
  ]);

  const accruedTotal = roundMoney(Number(accrued._sum.commissionAmount ?? 0));
  const paidTotal = roundMoney(Number(paid._sum.amount ?? 0));
  return {
    accrued: accruedTotal,
    paid: paidTotal,
    outstanding: roundMoney(accruedTotal - paidTotal),
    payouts: payouts.map((payout) => ({
      id: payout.id,
      amount: Number(payout.amount),
      method: payout.method,
      methodLabel: PAYOUT_METHOD_LABELS[payout.method],
      paidAt: payout.paidAt.toISOString(),
      paidByName: payout.paidBy?.name ?? null,
    })),
  };
}

export type PayCommissionInput = {
  organizationId: string;
  salonIds?: string[] | null;
  barberId: string;
  amount: number;
  method: CommissionPayoutMethod;
  periodFrom?: Date | string | null;
  periodTo?: Date | string | null;
  reference?: string | null;
  note?: string | null;
  idempotencyKey: string;
  actorUserId: string;
  actorType: Extract<AuditActorType, "OWNER" | "ADMIN">;
  auditMeta?: { ipAddress?: string | null; userAgent?: string | null };
};

export async function payCommission(prisma: PayoutPrisma, input: PayCommissionInput) {
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) throw new BusinessError("مبلغ الصرف يجب أن يكون أكبر من صفر");
  if (input.method === "BANK_TRANSFER" && !input.reference?.trim()) {
    throw new BusinessError("اكتب رقم الحوالة لتتبّع التحويل البنكي");
  }

  return runSerializable(prisma, async (tx) => {
    const duplicate = await tx.commissionPayout.findUnique({
      where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } },
      include: payoutInclude,
    });
    if (duplicate) return toPayoutRow(duplicate);

    const barber = await tx.barber.findFirst({
      where: {
        id: input.barberId,
        organizationId: input.organizationId,
        ...(input.salonIds?.length ? { salonId: { in: input.salonIds } } : {}),
      },
      select: { id: true, name: true, salonId: true, commissionEnabled: true },
    });
    if (!barber) throw new BusinessError("الحلاق غير موجود في نطاقك", 404);

    const { accrued, paid } = await readBalance(tx, input.organizationId, input.barberId);
    const outstanding = roundMoney(accrued - paid);

    if (input.method === "OPENING_SETTLEMENT") {
      const existing = await tx.commissionPayout.count({
        where: { barberId: barber.id, method: "OPENING_SETTLEMENT", reversedAt: null },
      });
      if (existing > 0) throw new BusinessError("سُجّلت تسوية افتتاحية لهذا الحلاق مسبقًا", 409);
    }

    // لا صرف زائد صامت: الصرف يقفل دَينًا قائمًا، وما فوقه ليس عمولة.
    if (amount > outstanding + 0.009) {
      throw new BusinessError(
        `المتبقي للحلاق ${outstanding} ريال فقط. عدّل المبلغ أو راجع الزيارات قبل الصرف.`,
        409,
      );
    }

    const now = new Date();
    const payout = await tx.commissionPayout.create({
      data: {
        organizationId: input.organizationId,
        salonId: barber.salonId,
        barberId: barber.id,
        periodFrom: input.periodFrom ? new Date(input.periodFrom) : now,
        periodTo: input.periodTo ? new Date(input.periodTo) : now,
        amount,
        method: input.method,
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
        accruedSnapshot: accrued,
        paidBeforeSnapshot: paid,
        outstandingAfter: roundMoney(outstanding - amount),
        paidByUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      },
      include: payoutInclude,
    });

    await applyCashEffect(tx, {
      method: input.method,
      amount,
      organizationId: input.organizationId,
      salonId: barber.salonId,
      barberId: barber.id,
      payoutId: payout.id,
      barberName: barber.name,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      reverse: false,
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        salonId: barber.salonId,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        action: "commission_payout.paid",
        entityType: "CommissionPayout",
        entityId: payout.id,
        after: {
          barberId: barber.id,
          amount,
          method: input.method,
          accrued,
          paidBefore: paid,
          outstandingAfter: roundMoney(outstanding - amount),
        },
        ipAddress: input.auditMeta?.ipAddress,
        userAgent: input.auditMeta?.userAgent,
      },
    });

    return toPayoutRow(payout);
  });
}

export async function reverseCommissionPayout(
  prisma: PayoutPrisma,
  input: {
    organizationId: string;
    salonIds?: string[] | null;
    payoutId: string;
    reason: string;
    actorUserId: string;
    actorType: Extract<AuditActorType, "OWNER" | "ADMIN">;
    auditMeta?: { ipAddress?: string | null; userAgent?: string | null };
  },
) {
  if (input.reason.trim().length < 3) throw new BusinessError("اكتب سبب عكس الصرف بوضوح");

  return runSerializable(prisma, async (tx) => {
    const payout = await tx.commissionPayout.findFirst({
      where: {
        id: input.payoutId,
        organizationId: input.organizationId,
        ...(input.salonIds?.length ? { salonId: { in: input.salonIds } } : {}),
      },
      include: { ...payoutInclude, barber: { select: { id: true, name: true } } },
    });
    if (!payout) throw new BusinessError("سند الصرف غير موجود", 404);
    if (payout.reversedAt) throw new BusinessError("عُكس هذا الصرف مسبقًا", 409);

    const reversed = await tx.commissionPayout.update({
      where: { id: payout.id },
      data: { reversedAt: new Date(), reversedByUserId: input.actorUserId, reversalReason: input.reason.trim() },
      include: payoutInclude,
    });

    await applyCashEffect(tx, {
      method: payout.method,
      amount: Number(payout.amount),
      organizationId: payout.organizationId,
      salonId: payout.salonId,
      barberId: payout.barberId,
      payoutId: payout.id,
      barberName: payout.barber.name,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      reverse: true,
    });

    await tx.auditLog.create({
      data: {
        organizationId: payout.organizationId,
        salonId: payout.salonId,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        action: "commission_payout.reversed",
        entityType: "CommissionPayout",
        entityId: payout.id,
        before: { amount: Number(payout.amount), method: payout.method },
        after: { reason: input.reason.trim() },
        ipAddress: input.auditMeta?.ipAddress,
        userAgent: input.auditMeta?.userAgent,
      },
    });

    return toPayoutRow(reversed);
  });
}

export async function listCommissionPayouts(
  prisma: PayoutPrisma,
  scope: { organizationId: string; salonIds?: string[] | null; barberId?: string | null; take?: number },
) {
  const payouts = await prisma.commissionPayout.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(scope.salonIds?.length ? { salonId: { in: scope.salonIds } } : {}),
      ...(scope.barberId ? { barberId: scope.barberId } : {}),
    },
    include: payoutInclude,
    orderBy: { paidAt: "desc" },
    take: scope.take ?? 60,
  });
  return payouts.map(toPayoutRow);
}

/**
 * أثر النقد لكل طريقة. الحوالة والتسوية الافتتاحية بلا أثر نقدي داخل النظام،
 * والنقد من الخزنة أو من العهدة يُسجَّل حركة في نفس دفتر الرقابة النقدية القائم.
 */
async function applyCashEffect(
  tx: Prisma.TransactionClient,
  input: {
    method: CommissionPayoutMethod;
    amount: number;
    organizationId: string;
    salonId: string;
    barberId: string;
    payoutId: string;
    barberName: string;
    actorType: Extract<AuditActorType, "OWNER" | "ADMIN">;
    actorUserId: string;
    reverse: boolean;
  },
) {
  const { amount, reverse } = input;
  const suffix = reverse ? "REVERSAL:" : "";

  if (input.method === "CASH_FROM_SAFE") {
    const safe = await tx.branchCashSafe.upsert({
      where: { salonId: input.salonId },
      update: {},
      create: { salonId: input.salonId, organizationId: input.organizationId },
    });
    const before = Number(safe.balance);
    const delta = reverse ? amount : -amount;
    const after = roundMoney(before + delta);
    if (after < 0) {
      throw new BusinessError("رصيد خزنة الفرع لا يكفي لصرف هذا المبلغ", 409);
    }
    await tx.branchCashSafe.update({
      where: { salonId: input.salonId },
      data: { balance: after, lastMovementAt: new Date() },
    });
    await tx.cashCustodyMovement.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        barberId: input.barberId,
        type: reverse ? "SAFE_COMMISSION_PAYOUT_REVERSAL" : "SAFE_COMMISSION_PAYOUT",
        amount,
        branchDelta: delta,
        branchBalanceBefore: before,
        branchBalanceAfter: after,
        referenceKey: `COMMISSION:SAFE:${suffix}${input.payoutId}`,
        referenceId: input.payoutId,
        note: `${reverse ? "عكس صرف" : "صرف"} عمولة ${input.barberName} من خزنة الفرع`,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
      },
    });
    return;
  }

  if (input.method === "BARBER_CUSTODY_DEDUCTION") {
    // الحلاق يبقي ما يعادل عمولته مما بيده: تنقص عهدته ولا تدخل الخزنة.
    await recordBarberCashDelta(tx, {
      organizationId: input.organizationId,
      salonId: input.salonId,
      barberId: input.barberId,
      amount: reverse ? amount : -amount,
      type: reverse ? "CUSTODY_COMMISSION_PAYOUT_REVERSAL" : "CUSTODY_COMMISSION_PAYOUT",
      referenceKey: `COMMISSION:CUSTODY:${suffix}${input.payoutId}`,
      referenceId: input.payoutId,
      note: `${reverse ? "عكس صرف" : "صرف"} عمولة ${input.barberName} خصمًا من عهدته`,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
    });
  }
}

/** الرصيد داخل معاملة الصرف — مقيَّد بالمؤسسة صراحةً كبقية استعلامات الدفتر. */
async function readBalance(tx: Prisma.TransactionClient, organizationId: string, barberId: string) {
  const [accrued, paid] = await Promise.all([
    tx.visit.aggregate({ where: { barberId, organizationId, status: "COMPLETED" }, _sum: { commissionAmount: true } }),
    tx.commissionPayout.aggregate({ where: { barberId, organizationId, reversedAt: null }, _sum: { amount: true } }),
  ]);
  return {
    accrued: roundMoney(Number(accrued._sum.commissionAmount ?? 0)),
    paid: roundMoney(Number(paid._sum.amount ?? 0)),
  };
}

const payoutInclude = {
  barber: { select: { id: true, name: true } },
  salon: { select: { id: true, name: true } },
  paidBy: { select: { id: true, name: true } },
  reversedBy: { select: { id: true, name: true } },
} satisfies Prisma.CommissionPayoutInclude;

export type CommissionPayoutRow = ReturnType<typeof toPayoutRow>;

function toPayoutRow(payout: Prisma.CommissionPayoutGetPayload<{ include: typeof payoutInclude }>) {
  return {
    id: payout.id,
    barber: payout.barber,
    salon: payout.salon,
    amount: Number(payout.amount),
    method: payout.method,
    methodLabel: PAYOUT_METHOD_LABELS[payout.method],
    reference: payout.reference,
    note: payout.note,
    periodFrom: payout.periodFrom.toISOString(),
    periodTo: payout.periodTo.toISOString(),
    accruedSnapshot: Number(payout.accruedSnapshot),
    paidBeforeSnapshot: Number(payout.paidBeforeSnapshot),
    outstandingAfter: Number(payout.outstandingAfter),
    paidAt: payout.paidAt.toISOString(),
    paidBy: payout.paidBy,
    reversedAt: payout.reversedAt?.toISOString() ?? null,
    reversedBy: payout.reversedBy,
    reversalReason: payout.reversalReason,
  };
}

async function runSerializable<T>(prisma: PayoutPrisma, callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 25));
    }
  }
  throw new BusinessError("تعذر تنفيذ الصرف بعد عدة محاولات");
}
