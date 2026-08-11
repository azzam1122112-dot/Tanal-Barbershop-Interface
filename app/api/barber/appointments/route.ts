import { NextResponse } from "next/server";
import { requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { listAppointments } from "@/lib/appointments/appointment-service";
import { BARBER_APPOINTMENTS_DAYS } from "@/lib/appointments/barber-window";

export async function GET() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  // نفس مدى صفحة الحلاق: التحديث الدوري لا يجوز أن يقصّ ما رسمه الخادم.
  const appointments = await listAppointments(prisma, {
    organizationId: session.organizationId,
    salonIds: [session.salonId],
    barberId: session.barber.id,
    days: BARBER_APPOINTMENTS_DAYS,
  });

  return NextResponse.json(
    {
      appointments: appointments.filter(
        (appointment) => appointment.status === "BOOKED" || appointment.status === "ARRIVED",
      ),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
