import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import {
  getBarberRescheduleOptions,
  rescheduleBarberAppointment,
} from "@/lib/appointments/barber-reschedule";
import { toErrorResponse } from "@/lib/http/error-response";

const patchSchema = z.object({
  startAt: z.string().datetime({ offset: true }),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const result = await getBarberRescheduleOptions(prisma, {
      organizationId: session.organizationId,
      salonId: session.salonId,
      barberId: session.barber.id,
      appointmentId: id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "تعذر جلب الأوقات المتاحة");
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "وقت الموعد الجديد غير صحيح" }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const appointment = await rescheduleBarberAppointment(prisma, {
      organizationId: session.organizationId,
      salonId: session.salonId,
      barberId: session.barber.id,
      appointmentId: id,
      startAt: parsed.data.startAt,
    });
    return NextResponse.json({ appointment });
  } catch (error) {
    return toErrorResponse(error, "تعذر تغيير موعد الحجز");
  }
}
