import { BusinessError } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import type { PaymentMethod, PrismaClient } from "@prisma/client";
import { getAvailableCampaigns, getEligibleCampaignOrThrow } from "@/lib/campaigns/campaign-eligibility";
import { assertOpenCashSession } from "@/lib/cash-sessions/cash-session-service";
import { calculateVisitTotals } from "@/lib/loyalty/calculations";
import { getEffectiveSettings } from "@/lib/settings/system-settings";
import { issueInvoiceNumber } from "@/lib/invoicing/invoice-number";
import { assertSubscriptionActive } from "@/lib/plans/subscription-guard";
import { calculateVisitCommission } from "@/lib/commissions/commission";
import { recordStockMovement } from "@/lib/products/product-service";
import { roundMoney } from "@/lib/visits/visit-totals";
import { recordBarberCashDelta } from "@/lib/cash-custody/cash-custody-service";

/** يحوّل قيمة Decimal اختيارية إلى رقم، أو null إن كانت غائبة. */
function numberOrNull(value: { toString(): string } | number | null | undefined) {
  return value == null ? null : Number(value);
}

type ResolvedProductLine = {
  productId: string;
  productName: string;
  unitPrice: number;
  /** تكلفة الوحدة لحظة البيع — لقطة مجمَّدة، لا قراءة من الكتالوج وقت التقرير. */
  unitCost: number | null;
  quantity: number;
  lineTotal: number;
  commissionRate: number | null;
  stockQuantity: number;
};

/**
 * يحوّل طلب المنتجات إلى سطور بأسعار الكتالوج ويتحقق من التوفر.
 * الأسعار **لا تُقبل من العميل** — تُقرأ من قاعدة البيانات دائمًا.
 */
async function resolveProductLines(prisma: VisitPrisma, input: VisitInput): Promise<ResolvedProductLine[]> {
  const requested = (input.products ?? []).filter((line) => line.quantity > 0);
  if (requested.length === 0) return [];

  const merged = new Map<string, number>();
  for (const line of requested) {
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + Math.trunc(line.quantity));
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: [...merged.keys()] },
      organizationId: input.organizationId,
      salonId: input.salonId,
      isActive: true,
    },
  });

  if (products.length !== merged.size) {
    throw new BusinessError("أحد المنتجات المختارة غير متاح في هذا الفرع");
  }

  return products.map((product) => {
    const quantity = merged.get(product.id) ?? 0;
    if (quantity > product.stockQuantity) {
      throw new BusinessError(`الكمية المتاحة من ${product.name} هي ${product.stockQuantity} فقط`, 409);
    }
    const unitPrice = Number(product.price);
    return {
      productId: product.id,
      productName: product.name,
      unitPrice,
      // تكلفة الوحدة تُلتقط الآن ولا تُقرأ من الكتالوج وقت التقرير: تعديل التكلفة
      // لاحقًا يجب ألا يعيد كتابة مجمل ربح شهر مضى، كما لا تفعل نسبة العمولة.
      unitCost: numberOrNull(product.costPrice),
      quantity,
      lineTotal: roundMoney(unitPrice * quantity),
      commissionRate: numberOrNull(product.commissionRate),
      stockQuantity: product.stockQuantity,
    };
  });
}
import { getActiveManagerRewards, getRedeemableManagerRewardOrThrow } from "@/lib/manager-rewards/manager-reward-service";
import { toSafeService } from "@/lib/services/service-summary";

type VisitPrisma = PrismaClient | Prisma.TransactionClient;

type VisitInput = {
  organizationId: string;
  salonId: string;
  customerId?: string | null;
  barberId: string;
  serviceIds: string[];
  /** منتجات تُباع مع الزيارة. أسعارها من الكتالوج وتُضاف فوق مبلغ الخدمات. */
  products?: { productId: string; quantity: number }[];
  grossAmount: number;
  paymentMethod: PaymentMethod;
  paymentConfirmed?: boolean;
  cashTenderedAmount?: number | null;
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

  if (serviceIds.length === 0) {
    throw new BusinessError("اختر خدمة واحدة على الأقل");
  }

  // الاستعلام منفصل ليبقى نوع العميل وعلاقة الولاء دقيقين حتى عندما تكون العملية نقدية بلا عميل.
  const customer = input.customerId
    ? await prisma.customer.findFirst({
        where: { id: input.customerId, organizationId: input.organizationId },
        include: { loyaltyAccount: true },
      })
    : null;
  const [barber, services, settings] = await Promise.all([
    prisma.barber.findFirst({
      where: { id: input.barberId, organizationId: input.organizationId, salonId: input.salonId },
    }),
    prisma.service.findMany({
      where: { id: { in: serviceIds }, isActive: true, organizationId: input.organizationId, salonId: input.salonId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    getEffectiveSettings(prisma, { organizationId: input.organizationId, salonId: input.salonId }),
  ]);

  if (input.customerId && !customer) {
    throw new BusinessError("العميل غير موجود");
  }

  if (!barber || !barber.isActive) {
    throw new BusinessError("الحلاق غير مصرح");
  }

  if (services.length !== serviceIds.length) {
    throw new BusinessError("كل الخدمات المختارة يجب أن تكون نشطة");
  }

  // السعر مرجعه كتالوج المنشأة فقط. قيمة الواجهة لا تُستخدم في الحساب،
  // وتُرفض إن عُبث بها حتى لا يستطيع حساب الحلاق تخفيض قيمة الخدمة.
  const servicesAmount = roundMoney(services.reduce((total, service) => total + Number(service.defaultPrice), 0));
  if (servicesAmount <= 0) throw new BusinessError("أسعار الخدمات المختارة غير صالحة؛ راجع مدير الصالون");
  if (roundMoney(input.grossAmount) !== servicesAmount) {
    throw new BusinessError("تغيّر سعر إحدى الخدمات. حدّث الصفحة وأعد المحاولة", 409);
  }

  const productLines = await resolveProductLines(prisma, input);
  const productsTotal = roundMoney(productLines.reduce((total, line) => total + line.lineTotal, 0));

  const totals = calculateVisitTotals({
    // المنتجات تُضاف فوق مبلغ الخدمات بأسعار الكتالوج، فلا يُخطئ الحلاق في جمعها.
    grossAmount: roundMoney(servicesAmount + productsTotal),
    discountAmount: 0,
    pointsPerCurrencyUnit: settings ? Number(settings.pointsPerCurrencyUnit) : 1,
    pointsCalculatedAfterDiscount: settings?.pointsCalculatedAfterDiscount ?? true,
  });
  const pointsBalance = customer?.loyaltyAccount?.points ?? 0;
  const loyaltyEnabled = customer?.loyaltyAccount != null;
  const [rewards, campaigns, managerRewards] = customer
    ? await Promise.all([
        loyaltyEnabled
          ? prisma.rewardRule.findMany({
              where: {
                organizationId: input.organizationId,
                isActive: true,
                requiredPoints: { lte: pointsBalance },
                discountAmount: { lte: totals.grossAmount },
              },
              orderBy: [{ requiredPoints: "asc" }, { discountAmount: "asc" }],
            })
          : Promise.resolve([]),
        getAvailableCampaigns({ prisma, organizationId: input.organizationId, customer, grossAmount: totals.grossAmount }),
        getActiveManagerRewards(prisma, customer.id, { grossAmount: totals.grossAmount }),
      ])
    : [[], [], []];

  return {
    customer: customer ? { id: customer.id, name: customer.name, phone: customer.phone } : null,
    barber: {
      id: barber.id,
      name: barber.name,
    },
    services: services.map((service) => toSafeService(service)),
    products: productLines.map((line) => ({
      id: line.productId,
      name: line.productName,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
    })),
    productsTotal,
    servicesAmount,
    grossAmount: totals.grossAmount,
    discountAmount: 0,
    netAmount: totals.netAmount,
    paymentMethod: input.paymentMethod,
    loyaltyEnabled,
    // تُمرَّر للواجهة لتحسب المعاينة بنفس دالة الخادم `calculateVisitTotals`
    // بدل تكرار منطق المال في العميل.
    pointsPerCurrencyUnit: settings ? Number(settings.pointsPerCurrencyUnit) : 1,
    pointsCalculatedAfterDiscount: settings?.pointsCalculatedAfterDiscount ?? true,
    expectedPointsEarned: loyaltyEnabled ? totals.pointsEarned : 0,
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
  const maxAttempts = 8;
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

  throw new BusinessError("تعذر حفظ الزيارة بعد إعادة المحاولة");
}

async function confirmVisitOnce(prisma: PrismaClient, input: VisitInput) {
  return prisma.$transaction(async (tx) => {
    if (!input.idempotencyKey) {
      throw new BusinessError("مفتاح منع التكرار مطلوب");
    }
    if (input.paymentConfirmed === false) {
      throw new BusinessError("أكد استلام الدفع قبل إتمام العملية");
    }
    const selectedDiscounts = [input.rewardRuleId, input.managerRewardId, input.campaignId].filter(Boolean);
    if (selectedDiscounts.length > 1) {
      if (input.rewardRuleId && input.campaignId && !input.managerRewardId) {
        throw new BusinessError("لا يمكن جمع مكافأة نقاط مع حملة في نفس الزيارة");
      }
      throw new BusinessError("لا يمكن جمع أكثر من خصم في نفس الزيارة");
    }
    if (!input.customerId && selectedDiscounts.length > 0) {
      throw new BusinessError("الخصومات والمكافآت تتطلب عميلًا مسجلًا");
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
    // الاشتراك المنتهي يوقف تسجيل الزيارات — أول بوابة قبل أي كتابة.
    await assertSubscriptionActive(tx, input.organizationId, now);
    const cashSession = await assertOpenCashSession(tx, input.barberId);
    const preview = await buildVisitPreview(tx, input);
    const settings = await getEffectiveSettings(tx, {
      organizationId: input.organizationId,
      salonId: input.salonId,
    });
    const customer = input.customerId
      ? await tx.customer.findFirst({
          where: { id: input.customerId, organizationId: input.organizationId },
          include: { loyaltyAccount: true },
        })
      : null;
    if (input.customerId && !customer) {
      throw new BusinessError("العميل غير موجود");
    }
    const reward = input.rewardRuleId
      ? await tx.rewardRule.findFirst({
          where: { id: input.rewardRuleId, organizationId: input.organizationId, isActive: true },
        })
      : null;
    const managerReward = input.managerRewardId
      ? await getRedeemableManagerRewardOrThrow(tx, {
          organizationId: input.organizationId,
          managerRewardId: input.managerRewardId,
          customerId: customer!.id,
          grossAmount: preview.grossAmount,
          now,
        })
      : null;
    const campaignSelection = input.campaignId
      ? await getEligibleCampaignOrThrow({
          prisma: tx,
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          customer: customer!,
          grossAmount: preview.grossAmount,
          now,
        })
      : null;

    if (input.rewardRuleId && (!reward || !reward.isActive)) {
      throw new BusinessError("المكافأة غير متاحة");
    }

    // لا نحول العميل العادي إلى عضو ولاء بمجرد تسجيل عملية. العضوية قرار صريح
    // عند إنشاء العميل، بينما تبقى الزيارة والفاتورة والصندوق صالحة بدونه.
    const loyaltyAccount = customer?.loyaltyAccount ?? null;
    const startingBalance = loyaltyAccount?.points ?? 0;
    const redeemedPoints = reward?.requiredPoints ?? 0;
    const discountAmount = reward ? Number(reward.discountAmount) : managerReward ? Number(managerReward.discountAmount) : campaignSelection?.discountAmount ?? 0;

    if (reward && !loyaltyAccount) {
      throw new BusinessError("العميل غير مشترك في برنامج الولاء");
    }

    if (reward && startingBalance < reward.requiredPoints) {
      throw new BusinessError("رصيد النقاط غير كافٍ");
    }

    if ((reward || managerReward || campaignSelection) && discountAmount > preview.grossAmount) {
      throw new BusinessError("قيمة الخصم أكبر من مبلغ الزيارة");
    }

    const totals = calculateVisitTotals({
      grossAmount: preview.grossAmount,
      discountAmount,
      pointsPerCurrencyUnit: settings ? Number(settings.pointsPerCurrencyUnit) : 1,
      pointsCalculatedAfterDiscount: settings?.pointsCalculatedAfterDiscount ?? true,
    });
    const earnedPoints = loyaltyAccount ? totals.pointsEarned : 0;
    const cashTenderedAmount = input.paymentMethod === "CASH"
      ? roundMoney(input.cashTenderedAmount ?? totals.netAmount)
      : null;
    if (cashTenderedAmount !== null && cashTenderedAmount < totals.netAmount) {
      throw new BusinessError("المبلغ المستلم أقل من المبلغ المطلوب");
    }
    const cashChangeAmount = cashTenderedAmount === null ? null : roundMoney(cashTenderedAmount - totals.netAmount);

    const balanceAfterRedeem = startingBalance - redeemedPoints;
    if (balanceAfterRedeem < 0) {
      throw new BusinessError("رصيد النقاط لا يمكن أن يكون سالبًا");
    }

    // العمولة تُحسب وقت الزيارة على المبلغ بعد الخصم، وتُخزَّن
    // مع نسبتها فلا يتغيّر المستحق التاريخي عند تعديل النسب لاحقًا.
    const barberRecord = await tx.barber.findUnique({
      where: { id: input.barberId },
      select: { commissionEnabled: true, commissionRate: true },
    });
    const serviceRates = await tx.service.findMany({
      where: { id: { in: preview.services.map((service) => service.id) } },
      select: { id: true, commissionRate: true },
    });
    const rateByService = new Map(serviceRates.map((row) => [row.id, row.commissionRate]));
    // المنتجات تدخل وعاء العمولة كسطور مثل الخدمات، بنسبتها الخاصة إن وُجدت.
    const soldProducts = await resolveProductLines(tx, input);
    const commission = calculateVisitCommission({
      lines: [
        ...preview.services.map((service) => ({
          serviceId: service.id,
          serviceName: service.name,
          unitPrice: service.defaultPrice,
          quantity: 1,
          lineTotal: service.defaultPrice,
          kind: "SERVICE" as const,
          serviceRate: numberOrNull(rateByService.get(service.id)),
        })),
        ...soldProducts.map((product) => ({
          serviceId: product.productId,
          serviceName: product.productName,
          unitPrice: product.unitPrice,
          unitCost: product.unitCost,
          quantity: product.quantity,
          lineTotal: product.lineTotal,
          kind: "PRODUCT" as const,
          serviceRate: product.commissionRate,
        })),
      ],
      commissionBase: totals.netAmount,
      enabled: barberRecord?.commissionEnabled === true,
      barberRate: numberOrNull(barberRecord?.commissionRate),
      defaultRate: numberOrNull(settings?.defaultCommissionRate),
    });
    const serviceCommissionLines = commission.lines.filter((line) => line.kind === "SERVICE");
    const productCommissionLines = commission.lines.filter((line) => line.kind === "PRODUCT");

    // رقم فاتورة تسلسلي لكل زيارة — داخل المعاملة نفسها فلا يتكرر ولا ينكسر التسلسل.
    const invoiceNumber = await issueInvoiceNumber(tx, {
      organizationId: input.organizationId,
      salonId: input.salonId,
      date: now,
    });

    const visit = await tx.visit.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        customerId: customer?.id,
        barberId: input.barberId,
        status: "COMPLETED",
        grossAmount: totals.grossAmount,
        discountAmount: totals.discountAmount,
        invoiceNumber,
        commissionAmount: commission.totalCommission,
        netAmount: totals.netAmount,
        paymentMethod: input.paymentMethod,
        cashTenderedAmount,
        cashChangeAmount,
        discountType: reward ? "REWARD" : managerReward ? "MANAGER_REWARD" : campaignSelection ? "CAMPAIGN" : "NONE",
        discountSourceId: reward?.id ?? managerReward?.id ?? campaignSelection?.campaign.id,
        cashSessionId: cashSession.id,
        idempotencyKey: input.idempotencyKey,
        pointsEarned: earnedPoints,
        visitedAt: now,
        services: {
          create: serviceCommissionLines.map((line) => ({
            serviceId: line.serviceId,
            serviceName: line.serviceName,
            unitPrice: line.unitPrice,
            quantity: 1,
            lineTotal: line.lineTotal,
            commissionRate: line.commissionRate,
            commissionAmount: line.commissionAmount,
          })),
        },
        productLines: {
          create: productCommissionLines.map((line) => ({
            productId: line.serviceId,
            productName: line.serviceName,
            unitPrice: line.unitPrice,
            unitCost: line.unitCost,
            quantity: line.quantity,
            lineTotal: line.lineTotal,
            commissionRate: line.commissionRate,
            commissionAmount: line.commissionAmount,
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

    // البيع النقدي يزيد عهدة الحلاق فقط؛ لا ينشئ إيرادًا ثانيًا ولا يغيّر تقرير المبيعات.
    if (visit.paymentMethod === "CASH" && Number(visit.netAmount) > 0) {
      await recordBarberCashDelta(tx, {
        organizationId: visit.organizationId,
        salonId: visit.salonId,
        barberId: visit.barberId,
        cashSessionId: visit.cashSessionId,
        amount: Number(visit.netAmount),
        type: "CASH_SALE",
        referenceKey: `VISIT:CASH:${visit.id}`,
        referenceId: visit.id,
        note: `فاتورة ${visit.invoiceNumber ?? visit.id}`,
        actorType: "BARBER",
        actorBarberId: visit.barberId,
      });
    }

    // خصم المخزون داخل المعاملة نفسها: إما تُحفظ الزيارة ويُخصم المخزون معًا، أو لا شيء.
    for (const line of productCommissionLines) {
      await recordStockMovement(tx, {
        productId: line.serviceId,
        organizationId: input.organizationId,
        type: "SALE",
        quantity: -line.quantity,
        reason: `بيع ضمن زيارة`,
        visitId: visit.id,
        recordedByBarberId: input.barberId,
      });
    }

    const campaignRedemption = campaignSelection
      ? await tx.campaignRedemption.create({
          data: {
            organizationId: input.organizationId,
            campaignId: campaignSelection.campaign.id,
            customerId: customer!.id,
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
            organizationId: input.organizationId,
            customerId: customer!.id,
            visitId: visit.id,
            type: "REDEEM",
            points: -redeemedPoints,
            balanceAfter: balanceAfterRedeem,
            description: `استبدال ${redeemedPoints} نقطة مقابل خصم ${discountAmount} ريال`,
          },
        }),
      );
    }

    const finalBalance = balanceAfterRedeem + earnedPoints;
    if (loyaltyAccount && earnedPoints > 0) {
      createdTransactions.push(
        await tx.loyaltyTransaction.create({
          data: {
            organizationId: input.organizationId,
            customerId: customer!.id,
            visitId: visit.id,
            type: "EARN",
            points: earnedPoints,
            balanceAfter: finalBalance,
            description: "نقاط زيارة",
          },
        }),
      );
    }

    if (loyaltyAccount) {
      await tx.loyaltyAccount.update({
        where: { customerId: customer!.id },
        data: {
          points: finalBalance,
          lifetimeEarned: earnedPoints > 0 ? { increment: earnedPoints } : undefined,
          lifetimeRedeemed: redeemedPoints > 0 ? { increment: redeemedPoints } : undefined,
        },
      });
    }

    if (customer) {
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          visitCount: { increment: 1 },
          totalPaid: { increment: totals.netAmount },
          lastVisitAt: now,
          lastBarberId: input.barberId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        actorType: "BARBER",
        actorBarberId: input.barberId,
        action: "visit.confirmed",
        entityType: "Visit",
        entityId: visit.id,
        after: {
          barberId: input.barberId,
          customerId: customer?.id ?? null,
          visitId: visit.id,
          cashSessionId: cashSession.id,
          grossAmount: totals.grossAmount,
          discountAmount: totals.discountAmount,
          netAmount: totals.netAmount,
          commissionAmount: commission.totalCommission,
          invoiceNumber,
          paymentMethod: input.paymentMethod,
          serviceIds: input.serviceIds,
          rewardRuleId: reward?.id ?? null,
          managerRewardId: managerReward?.id ?? null,
          campaignId: campaignSelection?.campaign.id ?? null,
          redeemedPoints,
          pointsEarned: earnedPoints,
        },
        ipAddress: input.auditMeta?.ipAddress,
        userAgent: input.auditMeta?.userAgent,
      },
    });

    if (campaignSelection) {
      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          salonId: input.salonId,
          actorType: "BARBER",
          actorBarberId: input.barberId,
          action: "campaign.redeemed",
          entityType: "Campaign",
          entityId: campaignSelection.campaign.id,
          after: {
            campaignId: campaignSelection.campaign.id,
            customerId: customer!.id,
            visitId: visit.id,
            grossAmount: totals.grossAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
            pointsEarned: earnedPoints,
          },
          ipAddress: input.auditMeta?.ipAddress,
          userAgent: input.auditMeta?.userAgent,
        },
      });
    }

    if (managerReward) {
      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          salonId: input.salonId,
          actorType: "BARBER",
          actorBarberId: input.barberId,
          action: "manager_reward.redeemed",
          entityType: "ManagerReward",
          entityId: managerReward.id,
          after: {
            managerRewardId: managerReward.id,
            customerId: customer!.id,
            visitId: visit.id,
            grossAmount: totals.grossAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
            pointsEarned: earnedPoints,
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
    customer: visit.customer
      ? { id: visit.customer.id, name: visit.customer.name, phone: visit.customer.phone }
      : null,
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
    invoiceNumber: visit.invoiceNumber,
    netAmount: Number(visit.netAmount),
    paymentMethod: visit.paymentMethod,
    cashTenderedAmount: visit.cashTenderedAmount ? Number(visit.cashTenderedAmount) : null,
    cashChangeAmount: visit.cashChangeAmount ? Number(visit.cashChangeAmount) : 0,
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
