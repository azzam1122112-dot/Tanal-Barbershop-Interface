import { toErrorResponse } from "@/lib/http/error-response";
import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { visitAmountUpdateSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { updateVisitAmount } from "@/lib/visits/visit-admin-service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  const parsed = visitAmountUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات تعديل المبلغ غير صحيحة" }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const result = await updateVisitAmount(prisma, id, parsed.data.grossAmount, {
      actorUserId: session.user.id,
      actorType: session.role,
      organizationId: session.organizationId,
      salonIds: session.scopedSalonIds ?? undefined,
      reason: parsed.data.reason,
      ...(await getRequestMeta()),
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "تعذر تعديل مبلغ الزيارة");
  }
}
