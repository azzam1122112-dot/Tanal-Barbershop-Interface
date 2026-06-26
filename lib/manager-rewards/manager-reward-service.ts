import { BusinessError } from "@/lib/errors";
import type { ManagerReward, Prisma, PrismaClient, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";

type ManagerRewardPrisma = PrismaClient | Prisma.TransactionClient;

type ActorMeta = {
  actorUserId: string;
  actorType: Extract<UserRole, "ADMIN" | "SUPERVISOR">;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function createManagerReward(
  prisma: PrismaClient,
  input: {
    customerId: string;
    title: string;
    description?: string | null;
    discountAmount: number;
    expiresAt?: Date | null;
  },
  meta: ActorMeta,
) {
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw new BusinessError("العميل غير موجود");

  const reward = await prisma.managerReward.create({
    data: {
      customerId: input.customerId,
      issuedByUserId: meta.actorUserId,
      title: input.title,
      description: input.description,
      discountAmount: input.discountAmount,
      expiresAt: input.expiresAt,
    },
  });

  await writeAuditLog({
    prisma,
    actorType: meta.actorType,
    actorUserId: meta.actorUserId,
    action: "manager_reward.created",
    entityType: "ManagerReward",
    entityId: reward.id,
    after: toSafeManagerReward(reward),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return toSafeManagerReward(reward);
}

export async function getActiveManagerRewards(
  prisma: ManagerRewardPrisma,
  customerId: string,
  options: { grossAmount?: number; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const rewards = await prisma.managerReward.findMany({
    where: {
      customerId,
      redeemedAt: null,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      ...(options.grossAmount === undefined ? {} : { discountAmount: { lte: options.grossAmount } }),
    },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
  });
  return rewards.map(toSafeManagerReward);
}

export async function getRedeemableManagerRewardOrThrow(
  prisma: ManagerRewardPrisma,
  input: { managerRewardId: string; customerId: string; grossAmount: number; now?: Date },
) {
  const now = input.now ?? new Date();
  const reward = await prisma.managerReward.findUnique({ where: { id: input.managerRewardId } });
  if (!reward) throw new BusinessError("مكافأة الإدارة غير موجودة");
  if (reward.customerId !== input.customerId) throw new BusinessError("مكافأة الإدارة لا تخص هذا العميل");
  if (reward.redeemedAt || reward.redeemedVisitId) throw new BusinessError("مكافأة الإدارة مستخدمة مسبقًا");
  if (reward.revokedAt) throw new BusinessError("مكافأة الإدارة ملغاة");
  if (reward.expiresAt && reward.expiresAt < now) throw new BusinessError("مكافأة الإدارة منتهية");
  if (Number(reward.discountAmount) > input.grossAmount) throw new BusinessError("قيمة مكافأة الإدارة أكبر من مبلغ الزيارة");
  return reward;
}

export function toSafeManagerReward(reward: ManagerReward) {
  return {
    id: reward.id,
    customerId: reward.customerId,
    title: reward.title,
    description: reward.description,
    discountAmount: Number(reward.discountAmount),
    expiresAt: reward.expiresAt?.toISOString() ?? null,
    redeemedAt: reward.redeemedAt?.toISOString() ?? null,
    revokedAt: reward.revokedAt?.toISOString() ?? null,
    redeemedVisitId: reward.redeemedVisitId,
    createdAt: reward.createdAt.toISOString(),
  };
}
