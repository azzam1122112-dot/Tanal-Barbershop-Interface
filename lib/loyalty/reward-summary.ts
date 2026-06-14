import type { RewardRule } from "@prisma/client";

export function toSafeRewardRule(rule: RewardRule) {
  return {
    id: rule.id,
    name: rule.name,
    pointsRequired: rule.requiredPoints,
    discountAmount: Number(rule.discountAmount),
    isActive: rule.isActive,
    sortOrder: rule.sortOrder,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}
