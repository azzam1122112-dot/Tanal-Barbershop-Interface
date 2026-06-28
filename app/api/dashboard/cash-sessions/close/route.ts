import { toErrorResponse } from "@/lib/http/error-response";
import { NextResponse } from "next/server";
import { cashSessionCloseSchema } from "@/lib/auth/validation";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { closeCashSession } from "@/lib/cash-sessions/cash-session-service";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = cashSessionCloseSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات جلسة الصندوق غير صحيحة" }, { status: 400 });
  }

  try {
    const cashSession = await closeCashSession(prisma, {
      ...parsed.data,
      closedByUserId: session.user.id,
      closedByActorType: session.role,
      organizationId: session.organizationId,
      salonIds: session.scopedSalonIds ?? undefined,
      auditMeta: await getRequestMeta(),
    });
    return NextResponse.json({ cashSession }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر إغلاق جلسة الصندوق");
  }
}
