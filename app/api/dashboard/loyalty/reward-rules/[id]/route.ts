import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireAdminApi } from "@/lib/auth/http";
import { rewardRuleUpdateSchema } from "@/lib/auth/validation";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { prisma } from "@/lib/db/prisma";
import { toSafeRewardRule } from "@/lib/loyalty/reward-summary";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request);
  const parsed = rewardRuleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات المكافأة غير صحيحة" }, { status: 400 });
  }

  const before = await prisma.rewardRule.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!before) {
    return NextResponse.json({ message: "قاعدة المكافأة غير موجودة" }, { status: 404 });
  }

  try {
    const rule = await prisma.rewardRule.update({
      where: { id },
      data: parsed.data,
    });
    const meta = await getRequestMeta();
    await writeAuditLog({
      prisma,
      organizationId: session.organizationId,
      actorType: session.role,
      actorUserId: session.user.id,
      action:
        before.isActive !== rule.isActive
          ? rule.isActive
            ? "reward_rule.enabled"
            : "reward_rule.disabled"
          : "reward_rule.updated",
      entityType: "RewardRule",
      entityId: rule.id,
      before: toSafeRewardRule(before),
      after: toSafeRewardRule(rule),
      ...meta,
    });

    return NextResponse.json({ rewardRule: toSafeRewardRule(rule) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ message: "قاعدة المكافأة موجودة مسبقًا" }, { status: 409 });
    }
    throw error;
  }
}
