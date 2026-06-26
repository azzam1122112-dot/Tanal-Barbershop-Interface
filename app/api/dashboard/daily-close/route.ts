import { toErrorResponse } from "@/lib/http/error-response";
import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { dailyCloseSchema } from "@/lib/auth/validation";
import { closeBarberDay } from "@/lib/daily-close/daily-close-service";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  const parsed = dailyCloseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الإغلاق غير صحيحة" }, { status: 400 });
  }

  try {
    const close = await closeBarberDay(prisma, {
      barberId: parsed.data.barberId,
      date: parsed.data.date,
      cashReceivedAmount: parsed.data.cashReceivedAmount,
      notes: parsed.data.notes,
      receivedByUserId: session.user.id,
      receivedByActorType: session.role,
      auditMeta: await getRequestMeta(),
    });

    return NextResponse.json({ close }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر إغلاق اليوم");
  }
}
