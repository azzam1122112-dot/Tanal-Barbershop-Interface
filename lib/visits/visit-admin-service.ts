import { Prisma } from "@prisma/client";
import type { PaymentMethod, PrismaClient } from "@prisma/client";
import { computeCampaignDiscount } from "@/lib/campaigns/campaign-eligibility";
import { calculateVisitTotals } from "@/lib/loyalty/calculations";

type AdminVisitPrisma = PrismaClient | Prisma.TransactionClient;

type AdminMeta = {
  actorUserId: string;
  actorType: "ADMIN" | "SUPERVISOR";
  reason: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type VisitForAdmin = Prisma.VisitGetPayload<{
  include: {
    customer: { include: { loyaltyAccount: true } };
    barber: true;
    services: true;
    loyaltyTransactions: true;
    campaignRedemption: { include: { campaign: true } };
    cancelledBy: true;
    cashSession: true;
  };
}>;

export async function cancelVisit(prisma: PrismaClient, visitId: string, meta: AdminMeta) {
  return runSerializableTransaction(prisma, async (tx) => {
    const visit = await getVisitForAdmin(tx, visitId);
    if (visit.status === "CANCELLED") {
      throw new Error("الزيارة ملغاة مسبقًا");
    }

    const postCloseAdjustment = await isPostCloseAdjustment(tx, visit);
    const pointsEarnedToReverse = sumPoints(visit.loyaltyTransactions.filter((transaction) => transaction.type === "EARN").map((transaction) => transaction.points));
    const redeemedPointsToRestore = Math.abs(
      sumPoints(visit.loyaltyTransactions.filter((transaction) => transaction.type === "REDEEM").map((transaction) => transaction.points)),
    );
    const balanceBefore = await getBalance(tx, visit.customerId);
    const balanceAfterEarnReversal = balanceBefore - pointsEarnedToReverse;
    const balanceAfterRestore = balanceAfterEarnReversal + redeemedPointsToRestore;
    if (balanceAfterEarnReversal < 0) {
      throw new Error("لا يمكن عكس النقاط لأن رصيد العميل غير كافٍ");
    }

    if (pointsEarnedToReverse > 0) {
      await tx.loyaltyTransaction.create({
        data: {
          customerId: visit.customerId,
          visitId: visit.id,
          type: "REVERSAL",
          points: -pointsEarnedToReverse,
          balanceAfter: balanceAfterEarnReversal,
          description: `عكس نقاط زيارة ملغاة: ${meta.reason}`,
        },
      });
    }
    if (redeemedPointsToRestore > 0) {
      await tx.loyaltyTransaction.create({
        data: {
          customerId: visit.customerId,
          visitId: visit.id,
          type: "REVERSAL",
          points: redeemedPointsToRestore,
          balanceAfter: balanceAfterRestore,
          description: `إعادة نقاط مكافأة زيارة ملغاة: ${meta.reason}`,
        },
      });
    }

    await tx.loyaltyAccount.update({
      where: { customerId: visit.customerId },
      data: { points: balanceAfterRestore },
    });

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
    const latestCompletedVisit = await tx.visit.findFirst({
      where: { customerId: visit.customerId, status: "COMPLETED", id: { not: visit.id } },
      orderBy: { visitedAt: "desc" },
    });
    await tx.customer.update({
      where: { id: visit.customerId },
      data: {
        visitCount: { decrement: 1 },
        totalPaid: { decrement: Number(visit.netAmount) },
        lastVisitAt: latestCompletedVisit?.visitedAt ?? null,
        lastBarberId: latestCompletedVisit?.barberId ?? null,
      },
    });

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
        postCloseAdjustment,
      },
      postCloseAdjustment,
    });

    return toAdminVisitResponse(updated, { postCloseAdjustment });
  });
}

export async function updateVisitPaymentMethod(prisma: PrismaClient, visitId: string, paymentMethod: PaymentMethod, meta: AdminMeta) {
  return runSerializableTransaction(prisma, async (tx) => {
    const visit = await getCompletedVisitForAdmin(tx, visitId);
    const postCloseAdjustment = await isPostCloseAdjustment(tx, visit);
    const updated = await tx.visit.update({
      where: { id: visit.id },
      data: { paymentMethod },
      include: adminVisitInclude,
    });

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
    const visit = await getCompletedVisitForAdmin(tx, visitId);
    const postCloseAdjustment = await isPostCloseAdjustment(tx, visit);
    const settings = await tx.systemSettings.findUnique({ where: { singletonKey: "default" } });
    const discountAmount = await calculateUpdatedDiscount(tx, visit, grossAmount);
    const totals = calculateVisitTotals({
      grossAmount,
      discountAmount,
      pointsPerCurrencyUnit: settings ? Number(settings.pointsPerCurrencyUnit) : 1,
      pointsCalculatedAfterDiscount: settings?.pointsCalculatedAfterDiscount ?? true,
    });
    const currentEarned = sumPoints(visit.loyaltyTransactions.filter((transaction) => transaction.type === "EARN").map((transaction) => transaction.points));
    const pointsAdjustment = totals.pointsEarned - currentEarned;
    const balanceBefore = await getBalance(tx, visit.customerId);
    const balanceAfter = balanceBefore + pointsAdjustment;
    if (balanceAfter < 0) {
      throw new Error("لا يمكن تعديل المبلغ لأن رصيد العميل لا يكفي لعكس النقاط");
    }

    if (pointsAdjustment !== 0) {
      await tx.loyaltyTransaction.create({
        data: {
          customerId: visit.customerId,
          visitId: visit.id,
          type: "ADJUST",
          points: pointsAdjustment,
          balanceAfter,
          description: `تصحيح نقاط بعد تعديل مبلغ زيارة: ${meta.reason}`,
        },
      });
      await tx.loyaltyAccount.update({
        where: { customerId: visit.customerId },
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
    if (netDifference !== 0) {
      await tx.customer.update({
        where: { id: visit.customerId },
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
    const reward = visit.discountSourceId ? await tx.rewardRule.findUnique({ where: { id: visit.discountSourceId } }) : null;
    const discountAmount = reward ? Number(reward.discountAmount) : Number(visit.discountAmount);
    if (discountAmount > grossAmount) {
      throw new Error("قيمة خصم المكافأة أكبر من مبلغ الزيارة الجديد");
    }
    return discountAmount;
  }
  const campaign = visit.campaignRedemption?.campaign ?? (visit.discountSourceId ? await tx.campaign.findUnique({ where: { id: visit.discountSourceId } }) : null);
  if (!campaign) {
    const discountAmount = Number(visit.discountAmount);
    if (discountAmount > grossAmount) throw new Error("قيمة خصم الحملة أكبر من مبلغ الزيارة الجديد");
    return discountAmount;
  }
  const discountAmount = computeCampaignDiscount(campaign, grossAmount);
  if (discountAmount > grossAmount) {
    throw new Error("قيمة خصم الحملة أكبر من مبلغ الزيارة الجديد");
  }
  return discountAmount;
}

async function getVisitForAdmin(tx: AdminVisitPrisma, visitId: string) {
  const visit = await tx.visit.findUnique({ where: { id: visitId }, include: adminVisitInclude });
  if (!visit) throw new Error("الزيارة غير موجودة");
  return visit;
}

async function getCompletedVisitForAdmin(tx: AdminVisitPrisma, visitId: string) {
  const visit = await getVisitForAdmin(tx, visitId);
  if (visit.status !== "COMPLETED") {
    throw new Error("لا يمكن تعديل زيارة غير مكتملة");
  }
  return visit;
}

async function getBalance(tx: AdminVisitPrisma, customerId: string) {
  const account = await tx.loyaltyAccount.upsert({
    where: { customerId },
    update: {},
    create: { customerId, points: 0, lifetimeEarned: 0 },
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
      customer: { id: visit.customer.id, name: visit.customer.name, phone: visit.customer.phone },
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
  loyaltyTransactions: true,
  campaignRedemption: { include: { campaign: true } },
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
  throw new Error("تعذر تنفيذ التصحيح بعد عدة محاولات");
}

function isSerializableWriteConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
