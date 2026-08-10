import { NextResponse } from "next/server";
import { requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getBarberTodaySummary } from "@/lib/barber/barber-summary";
import { getBarberMonthlyCommission } from "@/lib/commissions/barber-monthly-commission";

export async function GET() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const [summary, monthlyCommission] = await Promise.all([
    getBarberTodaySummary(prisma, session.barber.id),
    getBarberMonthlyCommission(prisma, session.barber.id),
  ]);
  return NextResponse.json({ summary, monthlyCommission });
}
