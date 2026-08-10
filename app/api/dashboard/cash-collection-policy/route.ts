import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { assertSalonAllowed } from "@/lib/auth/salon-scope";
import { updateCashCollectionPolicy } from "@/lib/cash-custody/cash-custody-service";
import { prisma } from "@/lib/db/prisma";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({
  salonId: z.string().min(1),
  mode: z.enum(["DISABLED", "INTERVAL", "WEEKDAYS"]),
  intervalDays: z.coerce.number().int().min(1).max(30).default(1),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  thresholdAmount: z.coerce.number().positive().optional().nullable(),
  reminderHour: z.coerce.number().int().min(0).max(23).default(17),
});

export async function PUT(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "إعدادات غير صحيحة" }, { status: 400 });
  try {
    assertSalonAllowed(session, parsed.data.salonId);
    const policy = await updateCashCollectionPolicy(prisma, {
      organizationId: session.organizationId,
      ...parsed.data,
      actorUserId: session.user.id,
      actorType: session.role,
    });
    return NextResponse.json({ policy, message: "تم حفظ سياسة التحصيل" });
  } catch (error) {
    return toErrorResponse(error, "تعذر حفظ سياسة التحصيل");
  }
}
