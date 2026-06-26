import { toErrorResponse } from "@/lib/http/error-response";
import { NextResponse } from "next/server";
import { getRequestMeta, requireBarberApi } from "@/lib/auth/http";
import { openCashSession } from "@/lib/cash-sessions/cash-session-service";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  try {
    const result = await openCashSession(prisma, {
      barberId: session.barber.id,
      auditMeta: await getRequestMeta(),
    });
    return NextResponse.json(result, { status: result.alreadyOpen ? 200 : 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر فتح جلسة الصندوق");
  }
}
