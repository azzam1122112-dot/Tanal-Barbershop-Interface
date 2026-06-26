import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { rewardRuleCreateSchema } from "@/lib/auth/validation";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { toSafeRewardRule } from "@/lib/loyalty/reward-summary";

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  const parsed = rewardRuleCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات المكافأة غير صحيحة" }, { status: 400 });
  }

  try {
    const rule = await prisma.rewardRule.create({
      data: {
        organizationId: session.organizationId,
        name: parsed.data.name ?? `خصم ${parsed.data.discountAmount} ريال`,
        requiredPoints: parsed.data.requiredPoints,
        discountAmount: parsed.data.discountAmount,
        isActive: parsed.data.isActive ?? true,
        sortOrder: parsed.data.sortOrder,
      },
    });
    const meta = await getRequestMeta();
    await writeAuditLog({
      prisma,
      actorType: session.role,
      actorUserId: session.user.id,
      action: "reward_rule.created",
      entityType: "RewardRule",
      entityId: rule.id,
      after: toSafeRewardRule(rule),
      ...meta,
    });

    return NextResponse.json({ rewardRule: toSafeRewardRule(rule) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "قاعدة المكافأة موجودة مسبقًا" }, { status: 409 });
    }
    throw error;
  }
}
