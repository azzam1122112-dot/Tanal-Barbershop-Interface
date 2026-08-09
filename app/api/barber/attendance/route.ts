import { NextResponse } from "next/server";
import { parseJsonBody, requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { checkIn, checkOut, getOpenAttendance } from "@/lib/attendance/attendance-service";
import { toErrorResponse } from "@/lib/http/error-response";

export async function GET() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const open = await getOpenAttendance(prisma, session.barber.id);
  return NextResponse.json({
    attendance: open ? { id: open.id, checkInAt: open.checkInAt.toISOString(), isOpen: true } : null,
  });
}

export async function POST(request: Request) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const body = await parseJsonBody<{ action?: string }>(request);

  try {
    if (body.action === "check-out") {
      const record = await checkOut(prisma, {
        organizationId: session.organizationId,
        barberId: session.barber.id,
      });
      return NextResponse.json({ attendance: record });
    }

    const result = await checkIn(prisma, {
      organizationId: session.organizationId,
      salonId: session.salonId,
      barberId: session.barber.id,
      source: "SELF",
    });
    return NextResponse.json({ attendance: result.record, alreadyOpen: result.alreadyOpen });
  } catch (error) {
    return toErrorResponse(error, "تعذر تسجيل الحضور");
  }
}
