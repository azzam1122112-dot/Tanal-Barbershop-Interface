import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody, requireBarberApi } from "@/lib/auth/http";
import { visitConfirmRequestSchema } from "@/lib/auth/validation";
import { confirmVisit } from "@/lib/visits/visit-service";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { safeErrorMessage } from "@/lib/http/error-response";

export async function POST(request: Request) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  const parsed = visitConfirmRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الزيارة غير صحيحة" }, { status: 400 });
  }

  try {
    const meta = await getRequestMeta();
    const result = await confirmVisit(prisma, {
      organizationId: session.organizationId,
      salonId: session.salonId,
      customerId: parsed.data.customerId,
      barberId: session.barber.id,
      serviceIds: parsed.data.serviceIds,
      grossAmount: parsed.data.grossAmount,
      paymentMethod: parsed.data.paymentMethod,
      rewardRuleId: parsed.data.rewardRuleId,
      managerRewardId: parsed.data.managerRewardId,
      campaignId: parsed.data.campaignId,
      idempotencyKey: parsed.data.idempotencyKey,
      auditMeta: meta,
    });

    return NextResponse.json(result, { status: result.idempotentReplay ? 200 : 201 });
  } catch (error) {
    const message = safeErrorMessage(error, "تعذر حفظ الزيارة");
    await writeAuditLog({
      prisma,
      actorType: "BARBER",
      actorBarberId: session.barber.id,
      action: message.includes("جلسة صندوق") ? "visit.rejected_without_cash_session" : "visit.confirm_failed",
      entityType: "Visit",
      after: {
        customerId: parsed.data.customerId,
        serviceIds: parsed.data.serviceIds,
        grossAmount: parsed.data.grossAmount,
        paymentMethod: parsed.data.paymentMethod,
        rewardRuleId: parsed.data.rewardRuleId,
        managerRewardId: parsed.data.managerRewardId,
        campaignId: parsed.data.campaignId,
        reason: message,
      },
      ...(await getRequestMeta()),
    });

    return NextResponse.json({ message }, { status: 400 });
  }
}
