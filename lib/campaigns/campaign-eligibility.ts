import type { Campaign, CampaignDiscountType, CampaignTargetType, Customer, LoyaltyAccount, Prisma, PrismaClient } from "@prisma/client";

type CampaignPrisma = PrismaClient | Prisma.TransactionClient;

type CampaignCustomer = Pick<Customer, "id" | "visitCount" | "lastVisitAt"> & {
  loyaltyAccount?: Pick<LoyaltyAccount, "points"> | null;
};

export type AvailableCampaign = {
  id: string;
  name: string;
  description: string | null;
  discountType: CampaignDiscountType;
  discountAmount: number;
  label: string;
};

export function computeCampaignDiscount(campaign: Pick<Campaign, "discountType" | "discountValue">, grossAmount: number) {
  const discountValue = Number(campaign.discountValue);
  if (campaign.discountType === "FIXED_AMOUNT") {
    return roundMoney(discountValue);
  }

  return roundMoney(grossAmount * (discountValue / 100));
}

export async function getAvailableCampaigns({
  prisma,
  customer,
  grossAmount,
  now = new Date(),
}: {
  prisma: CampaignPrisma;
  customer: CampaignCustomer;
  grossAmount: number;
  now?: Date;
}) {
  const campaigns = await prisma.campaign.findMany({
    where: {
      isActive: true,
      startAt: { lte: now },
      endAt: { gte: now },
    },
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
  });

  const available: AvailableCampaign[] = [];
  for (const campaign of campaigns) {
    const eligibility = await evaluateCampaignEligibility({ prisma, campaign, customer, grossAmount, now });
    if (eligibility.eligible) {
      available.push(toAvailableCampaign(campaign, eligibility.discountAmount));
    }
  }

  return available;
}

export async function getEligibleCampaignOrThrow({
  prisma,
  campaignId,
  customer,
  grossAmount,
  now = new Date(),
}: {
  prisma: CampaignPrisma;
  campaignId: string;
  customer: CampaignCustomer;
  grossAmount: number;
  now?: Date;
}) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    throw new Error("الحملة غير متاحة");
  }

  const eligibility = await evaluateCampaignEligibility({ prisma, campaign, customer, grossAmount, now });
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason);
  }

  return {
    campaign,
    discountAmount: eligibility.discountAmount,
  };
}

async function evaluateCampaignEligibility({
  prisma,
  campaign,
  customer,
  grossAmount,
  now,
}: {
  prisma: CampaignPrisma;
  campaign: Campaign;
  customer: CampaignCustomer;
  grossAmount: number;
  now: Date;
}): Promise<{ eligible: true; discountAmount: number } | { eligible: false; reason: string }> {
  if (!campaign.isActive) {
    return { eligible: false, reason: "الحملة غير فعالة" };
  }
  if (campaign.startAt > now || campaign.endAt < now) {
    return { eligible: false, reason: "الحملة خارج الفترة المحددة" };
  }
  if (!isTargetMatch(campaign.targetType, campaign, customer, now)) {
    return { eligible: false, reason: "العميل غير مؤهل لهذه الحملة" };
  }

  const redemptionCount = await prisma.campaignRedemption.count({
    where: { campaignId: campaign.id, customerId: customer.id },
  });
  if (redemptionCount >= campaign.maxUsesPerCustomer) {
    return { eligible: false, reason: "تم استخدام هذه الحملة للعميل بالحد المسموح" };
  }

  const discountAmount = computeCampaignDiscount(campaign, grossAmount);
  if (discountAmount <= 0) {
    return { eligible: false, reason: "قيمة خصم الحملة غير صالحة" };
  }
  if (discountAmount > grossAmount) {
    return { eligible: false, reason: "قيمة الخصم أكبر من مبلغ الزيارة" };
  }

  return { eligible: true, discountAmount };
}

function isTargetMatch(targetType: CampaignTargetType, campaign: Campaign, customer: CampaignCustomer, now: Date) {
  if (targetType === "ALL_CUSTOMERS") return true;
  if (targetType === "NEW_CUSTOMERS") return customer.visitCount === 0;
  if (targetType === "CUSTOMERS_WITH_MIN_POINTS") return (customer.loyaltyAccount?.points ?? 0) >= (campaign.minPoints ?? 0);
  if (targetType === "INACTIVE_CUSTOMERS") {
    if (!customer.lastVisitAt) return true;
    const inactiveDays = campaign.inactiveDays ?? 0;
    const cutoff = new Date(now.getTime() - inactiveDays * 24 * 60 * 60 * 1000);
    return customer.lastVisitAt <= cutoff;
  }
  return false;
}

function toAvailableCampaign(campaign: Campaign, discountAmount: number): AvailableCampaign {
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    discountType: campaign.discountType,
    discountAmount,
    label:
      campaign.discountType === "PERCENTAGE"
        ? `${campaign.name} - خصم ${Number(campaign.discountValue)}%`
        : `${campaign.name} - خصم ${discountAmount} ريال`,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
