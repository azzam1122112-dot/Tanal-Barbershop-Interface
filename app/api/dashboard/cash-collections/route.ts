import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { assertSalonAllowed } from "@/lib/auth/salon-scope";
import { collectBarberCash } from "@/lib/cash-custody/cash-custody-service";
import { prisma } from "@/lib/db/prisma";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({
  salonId: z.string().min(1),
  barberId: z.string().min(1),
  countedAmount: z.coerce.number().min(0),
  collectedAmount: z.coerce.number().positive("المبلغ المستلم يجب أن يكون أكبر من صفر"),
  discrepancyReason: z.string().trim().max(300).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
  idempotencyKey: z.string().min(8).max(100),
});

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات التحصيل غير صحيحة" }, { status: 400 });
  try {
    assertSalonAllowed(session, parsed.data.salonId);
    const collection = await collectBarberCash(prisma, {
      organizationId: session.organizationId,
      ...parsed.data,
      actorUserId: session.user.id,
      actorType: session.role,
    });
    return NextResponse.json({ collection, message: "تم التحصيل ونقل المبلغ إلى خزنة الفرع" }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر تسجيل التحصيل");
  }
}
