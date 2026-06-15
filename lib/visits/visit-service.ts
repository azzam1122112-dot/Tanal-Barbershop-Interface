import { Prisma } from "@prisma/client";
import type { PaymentMethod, PrismaClient } from "@prisma/client";
import { getAvailableCampaigns, getEligibleCampaignOrThrow } from "@/lib/campaigns/campaign-eligibility";
import { assertOpenCashSession } from "@/lib/cash-sessions/cash-session-service";
import { calculateVisitTotals } from "@/lib/loyalty/calculations";
import { getActiveManagerRewards, getRedeemableManagerRewardOrThrow } from "@/lib/manager-rewards/manager-reward-service";
import { toSafeService } from "@/lib/services/service-summary";

type VisitPrisma = PrismaClient | Prisma.TransactionClient;

type VisitInput = {
  customerId: string;
  barberId: string;
  serviceIds: string[];
  grossAmount: number;
  paymentMethod: PaymentMethod;
  rewardRuleId?: string;
  managerRewardId?: string;
  campaignId?: string;
  idempotencyKey?: string;
  auditMeta?: {
    ipAddress?: string | null;
    userAgent?: string | null;
  };
};

export async function buildVisitPreview(prisma: VisitPrisma, input: VisitInput) {
  const serviceIds = [...new Set(input.serviceIds)];

  if (input.grossAmount <= 0) {
    throw new Error("المبلغ يجب أن يكون أكبر من صفر");
  }

  if (serviceIds.length === 0) {
    throw new Error("اختر خدمة واحدة على الأقل");
  }

  const [customer, barber, services, settings] = await Promise.all([
    prisma.customer.findUnique({ where: { id: input.customerId }, include: { loyaltyAccount: true } }),
    prisma.barber.findUnique({ where: { id: input.barberId } }),
    prisma.service.findMany({
      where: { id: { in: serviceIds }, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.systemSettings.findUnique({ where: { singletonKey: "default" } }),
  ]);

  if (!customer) {
    throw new Error("العميل غير موجود");
  }

  if (!barber || !barber.isActive) {
    throw new Error("الحلاق غير مصرح");
  }

  if (services.length !== serviceIds.length) {
    throw new Error("كل الخدمات المختارة يجب أن تكون نشطة");
  }

  const totals = calculateVisitTotals({
    grossAmount: input.grossAmount,
    discountAmount: 0,
    pointsPerCurrencyUnit: settings ? Number(settings.pointsPerCurrencyUnit) : 1,
    pointsCalculatedAfterDiscount: settings?.pointsCalculatedAfterDiscount ?? true,
  });
  const pointsBalance = customer.loyaltyAccount?.points ?? 0;
  const rewards = await prisma.rewardRule.findMany({
    where: {
      isActive: true,
      requiredPoints: { lte: pointsBalance },
      discountAmount: { lte: totals.grossAmount },
    },
    orderBy: [{ requiredPoints: "asc" }, { discountAmount: "asc" }],
  });
  const campaigns = await getAvailableCampaigns({
    prisma,
    customer,
    grossAmount: totals.grossAmount,
  });
  const managerRewards = await getActiveManagerRewards(prisma, customer.id, {
    grossAmount: totals.grossAmount,
  });

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
    },
    barber: {
      id: barber.id,
      name: barber.name,
    },
    services: services.map((service) => toSafeService(service)),
    grossAmount: totals.grossAmount,
    discountAmount: 0,
    netAmount: totals.netAmount,
    paymentMethod: input.paymentMethod,
    expectedPointsEarned: totals.pointsEarned,
    pointsBalance,
    availableRewards: rewards.map((reward) => ({
      id: reward.id,
      pointsRequired: reward.requiredPoints,
      discountAmount: Number(reward.discountAmount),
      label: `خصم ${Number(reward.discountAmount)} ريال مقابل ${reward.requiredPoints} نقطة`,
    })),
    availableManagerRewards: managerRewards.map((reward) => ({
      id: reward.id,
      title: reward.title,
      description: reward.description,
      discountAmount: reward.discountAmount,
      expiresAt: reward.expiresAt,
      label: `${reward.title} - خصم ${reward.discountAmount} ريال`,
    })),
    availableCampaigns: campaigns,
  };
}

export async function confirmVisit(prisma: PrismaClient, input: VisitInput) {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await confirmVisitOnce(prisma, input);
    } catch (error) {
      if (isSerializableConflict(error) && attempt < maxAttempts - 1) {
        await wait(40 * (attempt + 1) + Math.floor(Math.random() * 40));
        continue;
      }
      throw error;
    }
  }

  throw new Error("تعذر حفظ الزيارة بعد إعادة المحاولة");
}

async function confirmVisitOnce(prisma: PrismaClient, input: VisitInput) {
  return prisma.$transaction(async (tx) => {
    if (!input.idempotencyKey) {
      throw new Error("مفتاح منع التكرار مطلوب");
    }
    const selectedDiscounts = [input.rewardRuleId, input.managerRewardId, input.campaignId].filter(Boolean);
    if (selectedDiscounts.length > 1) {
      if (input.rewardRuleId && input.campaignId && !input.managerRewardId) {
        throw new Error("لا يمكن جمع مكافأة نقاط مع حملة في نفس الزيارة");
      }
      throw new Error("لا يمكن جمع أكثر من خصم في نفس الزيارة");
    }

    const existingVisit = await tx.visit.findFirst({
      where: {
        barberId: input.barberId,
        idempotencyKey: input.idempotencyKey,
      },
      include: {
        customer: true,
        barber: true,
        services: true,
        loyaltyTransactions: true,
        campaignRedemption: true,
      },
    });

    if (existingVisit) {
      return {
        visit: toConfirmedVisitSummary(existingVisit),
        idempotentReplay: true,
      };
    }

    const now = new Date();
    const cashSession = await assertOpenCashSession(tx, input.barberId);
    const preview = await buildVisitPreview(tx, input);
    const settings = await tx.systemSettings.findUnique({ where: { singletonKey: "default" } });
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
      include: { loyaltyAccount: true },
    });
    if (!customer) {
      throw new Error("العميل غير موجود");
    }
    const reward = input.rewardRuleId
      ? await tx.rewardRule.findUnique({ where: { id: input.rewardRuleId } })
      : null;
    const managerReward = input.managerRewardId
      ? await getRedeemableManagerRewardOrThrow(tx, {
          managerRewardId: input.managerRewardId,
          customerId: input.customerId,
          grossAmount: input.grossAmount,
          now,
        })
      : null;
    const campaignSelection = input.campaignId
      ? await getEligibleCampaignOrThrow({
          prisma: tx,
          campaignId: input.campaignId,
          customer,
          grossAmount: input.grossAmount,
          now,
        })
      : null;

    if (input.rewardRuleId && (!reward || !reward.isActive)) {
      throw new Error("المكافأة غير متاحة");
    }

    const loyaltyAccount = await tx.loyaltyAccount.upsert({
      where: { customerId: input.customerId },
      update: {},
      create: {
        customerId: input.customerId,
        points: 0,
        lifetimeEarned: 0,
      },
    });
    const startingBalance = loyaltyAccount.points;
    const redeemedPoints = reward?.requiredPoints ?? 0;
    const discountAmount = reward ? Number(reward.discountAmount) : managerReward ? Number(managerReward.discountAmount) : campaignSelection?.discountAmount ?? 0;

    if (reward && startingBalance < reward.requiredPoints) {
      throw new Error("رصيد النقاط غير كافٍ");
    }

    if ((reward || managerReward || campaignSelection) && discountAmount > input.grossAmount) {
      throw new Error("قيمة الخصم أكبر من مبلغ الزيارة");
    }

    const totals = calculateVisitTotals({
      grossAmount: input.grossAmount,
      discountAmount,
      pointsPerCurrencyUnit: settings ? Number(settings.pointsPerCurrencyUnit) : 1,
      pointsCalculatedAfterDiscount: settings?.pointsCalculatedAfterDiscount ?? true,
    });

    const balanceAfterRedeem = startingBalance - redeemedPoints;
    if (balanceAfterRedeem < 0) {
      throw new Error("رصيد النقاط لا يمكن أن يكون سالبًا");
    }

    const visit = await tx.visit.create({
      data: {
        customerId: input.customerId,
        barberId: input.barberId,
        status: "COMPLETED",
        grossAmount: totals.grossAmount,
        discountAmount: totals.discountAmount,
        netAmount: totals.netAmount,
        paymentMethod: input.paymentMethod,
        discountType: reward ? "REWARD" : managerReward ? "MANAGER_REWARD" : campaignSelection ? "CAMPAIGN" : "NONE",
        discountSourceId: reward?.id ?? managerReward?.id ?? campaignSelection?.campaign.id,
        cashSessionId: cashSession.id,
        idempotencyKey: input.idempotencyKey,
        pointsEarned: totals.pointsEarned,
        visitedAt: now,
        services: {
          create: preview.services.map((service) => ({
            serviceId: service.id,
            serviceName: service.name,
            unitPrice: service.defaultPrice,
            quantity: 1,
            lineTotal: service.defaultPrice,
          })),
        },
      },
      include: {
        customer: true,
        barber: true,
        services: true,
        loyaltyTransactions: true,
        campaignRedemption: true,
      },
    });

    const campaignRedemption = campaignSelection
      ? await tx.campaignRedemption.create({
          data: {
            campaignId: campaignSelection.campaign.id,
            customerId: input.customerId,
            visitId: visit.id,
            discountAmount: totals.discountAmount,
          },
        })
      : null;

    if (managerReward) {
      await tx.managerReward.update({
        where: { id: managerReward.id },
        data: {
          redeemedAt: now,
          redeemedVisitId: visit.id,
        },
      });
    }

    const createdTransactions = [];
    if (reward) {
      createdTransactions.push(
        await tx.loyaltyTransaction.create({
          data: {
            customerId: input.customerId,
            visitId: visit.id,
            type: "REDEEM",
            points: -redeemedPoints,
            balanceAfter: balanceAfterRedeem,
            description: `استبدال ${redeemedPoints} نقطة مقابل خصم ${discountAmount} ريال`,
          },
        }),
      );
    }

    const finalBalance = balanceAfterRedeem + totals.pointsEarned;
    if (totals.pointsEarned > 0) {
      createdTransactions.push(
        await tx.loyaltyTransaction.create({
          data: {
            customerId: input.customerId,
            visitId: visit.id,
            type: "EARN",
            points: totals.pointsEarned,
            balanceAfter: finalBalance,
            description: "نقاط زيارة",
          },
        }),
      );
    }

    await tx.loyaltyAccount.update({
      where: { customerId: input.customerId },
      data: {
        points: finalBalance,
        lifetimeEarned: totals.pointsEarned > 0 ? { increment: totals.pointsEarned } : undefined,
        lifetimeRedeemed: redeemedPoints > 0 ? { increment: redeemedPoints } : undefined,
      },
    });

    await tx.customer.update({
      where: { id: input.customerId },
      data: {
        visitCount: { increment: 1 },
        totalPaid: { increment: totals.netAmount },
        lastVisitAt: now,
        lastBarberId: input.barberId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: "BARBER",
        actorBarberId: input.barberId,
        action: "visit.confirmed",
        entityType: "Visit",
        entityId: visit.id,
        after: {
          barberId: input.barberId,
          customerId: input.customerId,
          visitId: visit.id,
          cashSessionId: cashSession.id,
          grossAmount: totals.grossAmount,
          discountAmount: totals.discountAmount,
          netAmount: totals.netAmount,
          paymentMethod: input.paymentMethod,
          serviceIds: input.serviceIds,
          rewardRuleId: reward?.id ?? null,
          managerRewardId: managerReward?.id ?? null,
          campaignId: campaignSelection?.campaign.id ?? null,
          redeemedPoints,
          pointsEarned: totals.pointsEarned,
        },
        ipAddress: input.auditMeta?.ipAddress,
        userAgent: input.auditMeta?.userAgent,
      },
    });

    if (campaignSelection) {
      await tx.auditLog.create({
        data: {
          actorType: "BARBER",
          actorBarberId: input.barberId,
          action: "campaign.redeemed",
          entityType: "Campaign",
          entityId: campaignSelection.campaign.id,
          after: {
            campaignId: campaignSelection.campaign.id,
            customerId: input.customerId,
            visitId: visit.id,
            grossAmount: totals.grossAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
            pointsEarned: totals.pointsEarned,
          },
          ipAddress: input.auditMeta?.ipAddress,
          userAgent: input.auditMeta?.userAgent,
        },
      });
    }

    if (managerReward) {
      await tx.auditLog.create({
        data: {
          actorType: "BARBER",
          actorBarberId: input.barberId,
          action: "manager_reward.redeemed",
          entityType: "ManagerReward",
          entityId: managerReward.id,
          after: {
            managerRewardId: managerReward.id,
            customerId: input.customerId,
            visitId: visit.id,
            grossAmount: totals.grossAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
            pointsEarned: totals.pointsEarned,
          },
          ipAddress: input.auditMeta?.ipAddress,
          userAgent: input.auditMeta?.userAgent,
        },
      });
    }

    return {
      visit: toConfirmedVisitSummary({
        ...visit,
        loyaltyTransactions: createdTransactions,
        campaignRedemption,
      }),
      idempotentReplay: false,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function isSerializableConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ConfirmedVisit = Prisma.VisitGetPayload<{
  include: {
    customer: true;
    barber: true;
    services: true;
    loyaltyTransactions: true;
    campaignRedemption: true;
  };
}>;

function toConfirmedVisitSummary(visit: ConfirmedVisit) {
  const redeem = visit.loyaltyTransactions.find((transaction) => transaction.type === "REDEEM");
  const earn = visit.loyaltyTransactions.find((transaction) => transaction.type === "EARN");

  return {
    id: visit.id,
    status: visit.status,
    visitedAt: visit.visitedAt.toISOString(),
    customer: {
      id: visit.customer.id,
      name: visit.customer.name,
      phone: visit.customer.phone,
    },
    barber: {
      id: visit.barber.id,
      name: visit.barber.name,
    },
    services: visit.services.map((service) => ({
      id: service.serviceId,
      name: service.serviceName,
      defaultPrice: Number(service.unitPrice),
    })),
    grossAmount: Number(visit.grossAmount),
    discountAmount: Number(visit.discountAmount),
    netAmount: Number(visit.netAmount),
    paymentMethod: visit.paymentMethod,
    discountType: visit.discountType,
    cashSessionId: visit.cashSessionId,
    pointsEarned: visit.pointsEarned,
    rewardRuleId: visit.discountType === "REWARD" ? visit.discountSourceId : null,
    managerRewardId: visit.discountType === "MANAGER_REWARD" ? visit.discountSourceId : null,
    campaignId: visit.discountType === "CAMPAIGN" ? visit.discountSourceId : null,
    campaignRedemptionId: visit.campaignRedemption?.id ?? null,
    redeemedPoints: redeem ? Math.abs(redeem.points) : 0,
    earnTransactionId: earn?.id ?? null,
    redeemTransactionId: redeem?.id ?? null,
  };
}
