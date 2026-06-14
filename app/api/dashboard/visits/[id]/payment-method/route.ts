import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { visitPaymentMethodUpdateSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { updateVisitPaymentMethod } from "@/lib/visits/visit-admin-service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  const parsed = visitPaymentMethodUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات تعديل الدفع غير صحيحة" }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const result = await updateVisitPaymentMethod(prisma, id, parsed.data.paymentMethod, {
      actorUserId: session.user.id,
      actorType: session.role,
      reason: parsed.data.reason,
      ...(await getRequestMeta()),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "تعذر تعديل طريقة الدفع" }, { status: 400 });
  }
}
