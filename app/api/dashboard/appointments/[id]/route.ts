import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { prisma } from "@/lib/db/prisma";
import { updateAppointmentStatus } from "@/lib/appointments/appointment-service";
import { toErrorResponse } from "@/lib/http/error-response";

const patchSchema = z.object({
  status: z.enum(["BOOKED", "ARRIVED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
  reason: z.string().trim().max(200).optional().nullable(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "حالة الموعد غير صحيحة" }, { status: 400 });
  }

  try {
    const appointment = await updateAppointmentStatus(prisma, id, parsed.data.status, {
      organizationId: session.organizationId,
      salonIds: effectiveSalonIds(session),
      actorUserId: session.user.id,
      actorType: session.role,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ appointment });
  } catch (error) {
    return toErrorResponse(error, "تعذر تحديث الموعد");
  }
}
