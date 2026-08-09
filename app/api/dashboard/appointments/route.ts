import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { assertSalonAllowed, effectiveSalonIds } from "@/lib/auth/salon-scope";
import { prisma } from "@/lib/db/prisma";
import { createAppointment, listAppointments } from "@/lib/appointments/appointment-service";
import { saudiPhoneInputSchema } from "@/lib/phone/saudi-phone";
import { toErrorResponse } from "@/lib/http/error-response";

const createSchema = z.object({
  salonId: z.string().min(1, "الفرع مطلوب"),
  barberId: z.string().min(1).optional().nullable(),
  customerName: z.string().trim().min(2, "اسم العميل مطلوب"),
  customerPhone: saudiPhoneInputSchema,
  startAt: z.string().min(1, "وقت الموعد مطلوب"),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const url = new URL(request.url);
  const appointments = await listAppointments(prisma, {
    organizationId: session.organizationId,
    salonIds: effectiveSalonIds(session),
    barberId: url.searchParams.get("barberId"),
    date: url.searchParams.get("date"),
  });

  return NextResponse.json({ appointments });
}

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = createSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات الموعد غير صحيحة" }, { status: 400 });
  }

  try {
    assertSalonAllowed(session, parsed.data.salonId);
    const appointment = await createAppointment(prisma, {
      organizationId: session.organizationId,
      salonId: parsed.data.salonId,
      barberId: parsed.data.barberId,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      startAt: parsed.data.startAt,
      durationMinutes: parsed.data.durationMinutes,
      notes: parsed.data.notes,
      actorUserId: session.user.id,
      actorType: session.role,
    });
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر حفظ الموعد");
  }
}
