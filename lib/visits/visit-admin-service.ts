import { BusinessError } from "@/lib/errors";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PaymentMethod, PrismaClient } from "@prisma/client";
import { computeCampaignDiscount } from "@/lib/campaigns/campaign-eligibility";
import { calculateVisitTotals } from "@/lib/loyalty/calculations";
import { getEffectiveSettings } from "@/lib/settings/system-settings";
import { recordStockMovement } from "@/lib/products/product-service";
import { recordBarberCashDelta } from "@/lib/cash-custody/cash-custody-service";

type AdminVisitPrisma = PrismaClient | Prisma.TransactionClient;

type AdminMeta = {
  actorUserId: string;
  actorType: "OWNER" | "ADMIN" | "SUPERVISOR";
  organizationId?: string;
  // نطاق فروع المشرف؛ undefined = بلا قيد فرع (مالك/مدير).
  salonIds?: string[];
  reason: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type VisitForAdmin = Prisma.VisitGetPayload<{
  include: {
    customer: { include: { loyaltyAccount: true } };
    barber: true;
    services: true;
    productLines: true;
    loyaltyTransactions: true;
    campaignRedemption: { include: { campaign: true } };
    managerReward: true;
    cancelledBy: true;
    cashSession: true;
  };
}>;

export async function cancelVisit(prisma: PrismaClient, visitId: string, meta: AdminMeta) {
  return runSerializableTransaction(prisma, async (tx) => {
    const visit = await getVisitForAdmin(tx, visitId, meta.organizationId, meta.salonIds);
    if (visit.status === "CANCELLED") {
      throw new BusinessError("الزيارة ملغاة مسبقًا");
    }

    const postCloseAdjustment = await isPostCloseAdjustment(tx, visit);
    const pointsEarnedToReverse = sumPoints(visit.loyaltyTransactions.filter((transaction) => transaction.type === "EARN").map((transaction) => transaction.points));
    const redeemedPointsToRestore = Math.abs(
      sumPoints(visit.loyaltyTransactions.filter((transaction) => transaction.type === "REDEEM").map((transaction) => transaction.points)),
    );
    const customerId = visit.customerId;
    const balanceBefore = customerId ? await getBalance(tx, customerId) : 0;
    const balanceAfterEarnReversal = balanceBefore - pointsEarnedToReverse;
    const balanceAfterRestore = balanceAfterEarnReversal + redeemedPointsToRestore;
    if (balanceAfterEarnReversal < 0) {
      throw new BusinessError("لا يمكن عكس النقاط لأن رصيد العميل غير كافٍ");
    }

    if (customerId && pointsEarnedToReverse > 0) {
      await tx.loyaltyTransaction.create({
        data: {
          organizationId: visit.organizationId,
          customerId,
          visitId: visit.id,
          type: "REVERSAL",
          points: -pointsEarnedToReverse,
          balanceAfter: balanceAfterEarnReversal,
          description: `عكس نقاط زيارة ملغاة: ${meta.reason}`,
        },
      });
    }
    if (customerId && redeemedPointsToRestore > 0) {
      await tx.loyaltyTransaction.create({
        data: {
          organizationId: visit.organizationId,
          customerId,
          visitId: visit.id,
          type: "REVERSAL",
          points: redeemedPointsToRestore,
          balanceAfter: balanceAfterRestore,
          description: `إعادة نقاط مكافأة زيارة ملغاة: ${meta.reason}`,
        },
      });
    }
    if (visit.discountType === "MANAGER_REWARD" && visit.managerReward) {
      await tx.managerReward.update({
        where: { id: visit.managerReward.id },
        data: {
          redeemedAt: null,
          redeemedVisitId: null,
        },
      });
    }

    if (customerId) {
      await tx.loyaltyAccount.updateMany({ where: { customerId }, data: { points: balanceAfterRestore } });
    }

    // إلغاء الزيارة يعيد المنتجات المباعة للمخزون بحركة مسجّلة لا بتعديل صامت.
    if (visit.organizationId) {
      for (const line of visit.productLines) {
        await recordStockMovement(tx, {
          productId: line.productId,
          organizationId: visit.organizationId,
          type: "RETURN",
          quantity: line.quantity,
          reason: `إلغاء زيارة: ${meta.reason}`,
          visitId: visit.id,
          recordedByUserId: meta.actorUserId,
        });
      }
    }

    const updated = await tx.visit.update({
      where: { id: visit.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledByUserId: meta.actorUserId,
        cancelReason: meta.reason,
      },
      include: adminVisitInclude,
    });
    if (visit.paymentMethod === "CASH") {
      await recordBarberCashDelta(tx, {
        organizationId: visit.organizationId,
        salonId: visit.salonId,
        barberId: visit.barberId,
        cashSessionId: visit.cashSessionId,
        amount: -Number(visit.netAmount),
        type: "VISIT_REVERSAL",
        referenceKey: `VISIT:CANCEL:${visit.id}`,
        referenceId: visit.id,
        note: meta.reason,
        actorType: meta.actorType,
        actorUserId: meta.actorUserId,
      });
    }
    if (customerId) {
      const latestCompletedVisit = await tx.visit.findFirst({
        where: { customerId, status: "COMPLETED", id: { not: visit.id } },
        orderBy: { visitedAt: "desc" },
      });
      await tx.customer.update({
        where: { id: customerId },
        data: {
          visitCount: { decrement: 1 },
          totalPaid: { decrement: Number(visit.netAmount) },
          lastVisitAt: latestCompletedVisit?.visitedAt ?? null,
          lastBarberId: latestCompletedVisit?.barberId ?? null,
        },
      });
    }

    await writeVisitAudit(tx, {
      meta,
      action: "visit.cancelled",
      visitId: visit.id,
      before: toAdminVisitSnapshot(visit),
      after: {
        oldStatus: visit.status,
        newStatus: "CANCELLED",
        reason: meta.reason,
        pointsReversed: pointsEarnedToReverse,
        redeemedPointsRestored: redeemedPointsToRestore,
        managerRewardRestored: visit.discountType === "MANAGER_REWARD",
        postCloseAdjustment,
      },
      postCloseAdjustment,
    });

    return toAdminVisitResponse(updated, { postCloseAdjustment });
  });
}

export async function updateVisitPaymentMethod(prisma: PrismaClient, visitId: string, paymentMethod: PaymentMethod, meta: AdminMeta) {
  return runSerializableTransaction(prisma, async (tx) => {
    const visit = await getCompletedVisitForAdmin(tx, visitId, meta.organizationId, meta.salonIds);
    const postCloseAdjustment = await isPostCloseAdjustment(tx, visit);
    const updated = await tx.visit.update({
      where: { id: visit.id },
      data: { paymentMethod },
      include: adminVisitInclude,
    });

    if (visit.paymentMethod !== paymentMethod) {
      const delta = paymentMethod === "CASH" ? Number(visit.netAmount) : -Number(visit.netAmount);
      await recordBarberCashDelta(tx, {
        organizationId: visit.organizationId,
        salonId: visit.salonId,
        barberId: visit.barberId,
        cashSessionId: visit.cashSessionId,
        amount: delta,
        type: "PAYMENT_METHOD_ADJUSTMENT",
        referenceKey: `VISIT:PAYMENT:${visit.id}:${randomUUID()}`,
        referenceId: visit.id,
        note: meta.reason,
        actorType: meta.actorType,
        actorUserId: meta.actorUserId,
      });
    }

    await writeVisitAudit(tx, {
      meta,
      action: "visit.payment_method_updated",
      visitId: visit.id,
      before: {
        paymentMethod: visit.paymentMethod,
        grossAmount: Number(visit.grossAmount),
        discountAmount: Number(visit.discountAmount),
        netAmount: Number(visit.netAmount),
        reason: meta.reason,
      },
      after: {
        paymentMethod,
        grossAmount: Number(visit.grossAmount),
        discountAmount: Number(visit.discountAmount),
        netAmount: Number(visit.netAmount),
        reason: meta.reason,
        postCloseAdjustment,
      },
      postCloseAdjustment,
    });

    return toAdminVisitResponse(updated, { postCloseAdjustment });
  });
}

export async function updateVisitAmount(prisma: PrismaClient, visitId: string, grossAmount: number, meta: AdminMeta) {
  return runSerializableTransaction(prisma, async (tx) => {
    const visit = await getCompletedVisitForAdmin(tx, visitId, meta.organizationId, meta.salonIds);
    const postCloseAdjustment = await isPostCloseAdjustment(tx, visit);
    const settings = await getEffectiveSettings(tx, {
      organizationId: visit.organizationId,
      salonId: visit.salonId,
    });
    const discountAmount = await calculateUpdatedDiscount(tx, visit, grossAmount);
    const totals = calculateVisitTotals({
      grossAmount,
      discountAmount,
      pointsPerCurrencyUnit: settings ? Number(settings.pointsPerCurrencyUnit) : 1,
      pointsCalculatedAfterDiscount: settings?.pointsCalculatedAfterDiscount ?? true,
    });
    const currentEarned = sumPoints(visit.loyaltyTransactions.filter((transaction) => transaction.type === "EARN").map((transaction) => transaction.points));
    const pointsAdjustment = totals.pointsEarned - currentEarned;
    const customerId = visit.customerId;
    const balanceBefore = customerId ? await getBalance(tx, customerId) : 0;
    const balanceAfter = balanceBefore + pointsAdjustment;
    if (balanceAfter < 0) {
      throw new BusinessError("لا يمكن تعديل المبلغ لأن رصيد العميل لا يكفي لعكس النقاط");
    }

    if (customerId && pointsAdjustment !== 0) {
      await tx.loyaltyTransaction.create({
        data: {
          organizationId: visit.organizationId,
          customerId,
          visitId: visit.id,
          type: "ADJUST",
          points: pointsAdjustment,
          balanceAfter,
          description: `تصحيح نقاط بعد تعديل مبلغ زيارة: ${meta.reason}`,
        },
      });
      await tx.loyaltyAccount.update({
        where: { customerId },
        data: { points: balanceAfter },
      });
    }

    const updated = await tx.visit.update({
      where: { id: visit.id },
      data: {
        grossAmount: totals.grossAmount,
        discountAmount: totals.discountAmount,
        netAmount: totals.netAmount,
        pointsEarned: totals.pointsEarned,
      },
      include: adminVisitInclude,
    });
    if (visit.discountType === "CAMPAIGN" && visit.campaignRedemption) {
      await tx.campaignRedemption.update({
        where: { visitId: visit.id },
        data: { discountAmount: totals.discountAmount },
      });
    }
    const netDifference = totals.netAmount - Number(visit.netAmount);
    if (visit.paymentMethod === "CASH" && netDifference !== 0) {
      await recordBarberCashDelta(tx, {
        organizationId: visit.organizationId,
        salonId: visit.salonId,
        barberId: visit.barberId,
        cashSessionId: visit.cashSessionId,
        amount: netDifference,
        type: "VISIT_AMOUNT_ADJUSTMENT",
        referenceKey: `VISIT:AMOUNT:${visit.id}:${randomUUID()}`,
        referenceId: visit.id,
        note: meta.reason,
        actorType: meta.actorType,
        actorUserId: meta.actorUserId,
      });
    }
    if (customerId && netDifference !== 0) {
      await tx.customer.update({
        where: { id: customerId },
        data: { totalPaid: { increment: netDifference } },
      });
    }

    await writeVisitAudit(tx, {
      meta,
      action: "visit.amount_updated",
      visitId: visit.id,
      before: {
        grossAmount: Number(visit.grossAmount),
        discountAmount: Number(visit.discountAmount),
        netAmount: Number(visit.netAmount),
        paymentMethod: visit.paymentMethod,
        pointsEarned: currentEarned,
        reason: meta.reason,
      },
      after: {
        grossAmount: totals.grossAmount,
        discountAmount: totals.discountAmount,
        netAmount: totals.netAmount,
        paymentMethod: visit.paymentMethod,
        pointsEarned: totals.pointsEarned,
        pointsAdjustment,
        reason: meta.reason,
        postCloseAdjustment,
      },
      postCloseAdjustment,
    });

    return toAdminVisitResponse(updated, { postCloseAdjustment, pointsAdjustment });
  });
}

async function calculateUpdatedDiscount(tx: AdminVisitPrisma, visit: VisitForAdmin, grossAmount: number) {
  if (visit.discountType === "NONE") return 0;
  if (visit.discountType === "REWARD") {
    const reward = visit.discountSourceId
      ? await tx.rewardRule.findFirst({ where: { id: visit.discountSourceId, organizationId: visit.organizationId } })
      : null;
    const discountAmount = reward ? Number(reward.discountAmount) : Number(visit.discountAmount);
    if (discountAmount > grossAmount) {
      throw new BusinessError("قيمة خصم المكافأة أكبر من مبلغ الزيارة الجديد");
    }
    return discountAmount;
  }
  if (visit.discountType === "MANAGER_REWARD") {
    const managerReward =
      visit.managerReward ??
      (visit.discountSourceId
        ? await tx.managerReward.findFirst({ where: { id: visit.discountSourceId, organizationId: visit.organizationId } })
        : null);
    const discountAmount = managerReward ? Number(managerReward.discountAmount) : Number(visit.discountAmount);
    if (discountAmount > grossAmount) {
      throw new BusinessError("قيمة مكافأة الإدارة أكبر من مبلغ الزيارة الجديد");
    }
    return discountAmount;
  }
  const campaign =
    visit.campaignRedemption?.campaign ??
    (visit.discountSourceId
      ? await tx.campaign.findFirst({ where: { id: visit.discountSourceId, organizationId: visit.organizationId } })
      : null);
  if (!campaign) {
    const discountAmount = Number(visit.discountAmount);
    if (discountAmount > grossAmount) throw new BusinessError("قيمة خصم الحملة أكبر من مبلغ الزيارة الجديد");
    return discountAmount;
  }
  const discountAmount = computeCampaignDiscount(campaign, grossAmount);
  if (discountAmount > grossAmount) {
    throw new BusinessError("قيمة خصم الحملة أكبر من مبلغ الزيارة الجديد");
  }
  return discountAmount;
}

async function getVisitForAdmin(tx: AdminVisitPrisma, visitId: string, organizationId?: string, salonIds?: string[]) {
  const visit = await tx.visit.findFirst({
    where: {
      id: visitId,
      ...(organizationId ? { organizationId } : {}),
      // قصر التعديل على فروع المشرف المسندة (المالك/المدير بلا قيد).
      ...(salonIds && salonIds.length ? { salonId: { in: salonIds } } : {}),
    },
    include: adminVisitInclude,
  });
  if (!visit) throw new BusinessError("الزيارة غير موجودة");
  return visit;
}

async function getCompletedVisitForAdmin(tx: AdminVisitPrisma, visitId: string, organizationId?: string, salonIds?: string[]) {
  const visit = await getVisitForAdmin(tx, visitId, organizationId, salonIds);
  if (visit.status !== "COMPLETED") {
    throw new BusinessError("لا يمكن تعديل زيارة غير مكتملة");
  }
  return visit;
}

async function getBalance(tx: AdminVisitPrisma, customerId: string) {
  const customer = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: { organizationId: true } });
  const account = await tx.loyaltyAccount.upsert({
    where: { customerId },
    update: {},
    create: { customerId, organizationId: customer.organizationId, points: 0, lifetimeEarned: 0 },
  });
  return account.points;
}

async function isPostCloseAdjustment(tx: AdminVisitPrisma, visit: Pick<VisitForAdmin, "cashSessionId">) {
  if (!visit.cashSessionId) return false;
  const cashSession = await tx.cashSession.findUnique({ where: { id: visit.cashSessionId } });
  return cashSession?.status === "CLOSED";
}

async function writeVisitAudit(
  tx: AdminVisitPrisma,
  input: {
    meta: AdminMeta;
    action: string;
    visitId: string;
    before: unknown;
    after: unknown;
    postCloseAdjustment: boolean;
  },
) {
  await tx.auditLog.create({
    data: {
      organizationId: input.meta.organizationId,
      actorType: input.meta.actorType,
      actorUserId: input.meta.actorUserId,
      action: input.action,
      entityType: "Visit",
      entityId: input.visitId,
      before: JSON.parse(JSON.stringify(input.before)),
      after: JSON.parse(JSON.stringify(input.after)),
      ipAddress: input.meta.ipAddress,
      userAgent: input.meta.userAgent,
    },
  });
  if (input.postCloseAdjustment) {
    await tx.auditLog.create({
      data: {
        actorType: input.meta.actorType,
        actorUserId: input.meta.actorUserId,
        action: "visit.post_close_adjustment",
        entityType: "Visit",
        entityId: input.visitId,
        after: JSON.parse(JSON.stringify({ reason: input.meta.reason, action: input.action, postCloseAdjustment: true })),
        ipAddress: input.meta.ipAddress,
        userAgent: input.meta.userAgent,
      },
    });
  }
}

function toAdminVisitSnapshot(visit: VisitForAdmin) {
  return {
    id: visit.id,
    status: visit.status,
    grossAmount: Number(visit.grossAmount),
    discountAmount: Number(visit.discountAmount),
    netAmount: Number(visit.netAmount),
    paymentMethod: visit.paymentMethod,
    pointsEarned: visit.pointsEarned,
    discountType: visit.discountType,
    discountSourceId: visit.discountSourceId,
    cashSessionId: visit.cashSessionId,
  };
}

function toAdminVisitResponse<TExtra extends Record<string, unknown>>(visit: VisitForAdmin, extra: TExtra) {
  return {
    visit: {
      ...toAdminVisitSnapshot(visit),
      customer: visit.customer ? { id: visit.customer.id, name: visit.customer.name, phone: visit.customer.phone } : null,
      barber: { id: visit.barber.id, name: visit.barber.name },
      cancelledAt: visit.cancelledAt?.toISOString() ?? null,
      cancelReason: visit.cancelReason,
      cancelledBy: visit.cancelledBy ? { id: visit.cancelledBy.id, name: visit.cancelledBy.name } : null,
    },
    ...extra,
  };
}

const adminVisitInclude = {
  customer: { include: { loyaltyAccount: true } },
  barber: true,
  services: true,
  productLines: true,
  loyaltyTransactions: true,
  campaignRedemption: { include: { campaign: true } },
  managerReward: true,
  cancelledBy: true,
  cashSession: true,
} satisfies Prisma.VisitInclude;

function sumPoints(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

async function runSerializableTransaction<T>(prisma: PrismaClient, callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isSerializableWriteConflict(error) || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt + Math.floor(Math.random() * 50)));
    }
  }
  throw new BusinessError("تعذر تنفيذ التصحيح بعد عدة محاولات");
}

function isSerializableWriteConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
