import type { RewardRule } from "@prisma/client";

/**
 * هل يذكر اسم المكافأة مبلغَها أصلًا؟
 *
 * المديرون يسمّون قواعدهم بقيمتها: «خصم ٢٥ ريال»، «خصم ٦٠ ريال». وكانت الشاشات
 * تطبع الاسم ثم تُلحق به المبلغ، فيقرأ العميل **«خصم ٢٥ ريال  خصم ٢٥ ريال»** —
 * تكرارٌ حرفي يُقرأ خللًا في الشاشة لا تأكيدًا للمبلغ.
 *
 * **المطابقة على العدد لا على النص:** `name.includes("25")` تُطابق «خصم ٢٥٠
 * ريال» لمكافأة قيمتها ٢٥ فتحذف مبلغًا مختلفًا عن الاسم. هنا تُستخرج الأعداد
 * وتُقارن قيمةً.
 */
export function rewardNameMentionsAmount(name: string, discountAmount: number) {
  const numbers = name.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return numbers.some((raw) => Number(raw.replace(",", ".")) === discountAmount);
}

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
