import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { managerRewardCreateSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { createManagerReward } from "@/lib/manager-rewards/manager-reward-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const parsed = managerRewardCreateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات المكافأة غير صحيحة" }, { status: 400 });
  }

  try {
    const reward = await createManagerReward(
      prisma,
      {
        customerId: id,
        title: parsed.data.title,
        description: parsed.data.description,
        discountAmount: parsed.data.discountAmount,
        expiresAt: parsed.data.expiresAt,
      },
      {
        actorUserId: session.user.id,
        actorType: session.role,
        ...(await getRequestMeta()),
      },
    );
    return NextResponse.json({ reward }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "تعذر إصدار المكافأة" }, { status: 400 });
  }
}
