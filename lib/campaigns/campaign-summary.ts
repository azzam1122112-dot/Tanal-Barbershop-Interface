import type { Campaign } from "@prisma/client";

export function toSafeCampaign(campaign: Campaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    discountType: campaign.discountType,
    discountValue: Number(campaign.discountValue),
    targetType: campaign.targetType,
    inactiveDays: campaign.inactiveDays,
    minPoints: campaign.minPoints,
    startAt: campaign.startAt.toISOString(),
    endAt: campaign.endAt.toISOString(),
    maxUsesPerCustomer: campaign.maxUsesPerCustomer,
    isActive: campaign.isActive,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}
