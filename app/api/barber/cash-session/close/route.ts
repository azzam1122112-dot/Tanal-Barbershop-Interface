import { NextResponse } from "next/server";
import { getRequestMeta, requireBarberApi } from "@/lib/auth/http";
import { closeCashSession } from "@/lib/cash-sessions/cash-session-service";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  try {
    const cashSession = await closeCashSession(prisma, {
      barberId: session.barber.id,
      closedByBarberId: session.barber.id,
      closedByActorType: "BARBER",
      notes: "أغلقها الحلاق من واجهة الحلاق",
      auditMeta: await getRequestMeta(),
    });
    return NextResponse.json({ cashSession }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "تعذر إنهاء جلسة الصندوق" }, { status: 400 });
  }
}
