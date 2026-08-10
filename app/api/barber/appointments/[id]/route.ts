import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { updateAppointmentStatus } from "@/lib/appointments/appointment-service";
import { toErrorResponse } from "@/lib/http/error-response";

const patchSchema = z.object({
  status: z.enum(["ARRIVED", "NO_SHOW", "CANCELLED"]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "يمكن اختيار حضر أو لم يحضر أو إلغاء الحجز فقط" }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const appointment = await updateAppointmentStatus(prisma, id, parsed.data.status, {
      organizationId: session.organizationId,
      salonIds: [session.salonId],
      barberId: session.barber.id,
      allowedCurrentStatuses: ["BOOKED", "ARRIVED"],
      actorBarberId: session.barber.id,
      actorType: "BARBER",
      reason: parsed.data.status === "CANCELLED" ? "ألغاه الحلاق" : null,
    });
    return NextResponse.json({ appointment });
  } catch (error) {
    return toErrorResponse(error, "تعذر تحديث حالة الحجز");
  }
}
