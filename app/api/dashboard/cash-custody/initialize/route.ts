import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { assertSalonAllowed } from "@/lib/auth/salon-scope";
import { initializeBarberCashBalance } from "@/lib/cash-custody/cash-custody-service";
import { prisma } from "@/lib/db/prisma";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({
  salonId: z.string().min(1),
  barberId: z.string().min(1),
  countedAmount: z.coerce.number().min(0, "الرصيد الفعلي لا يمكن أن يكون سالبًا"),
  note: z.string().trim().max(300).optional().nullable(),
});

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }, { status: 400 });
  try {
    assertSalonAllowed(session, parsed.data.salonId);
    const balance = await initializeBarberCashBalance(prisma, {
      organizationId: session.organizationId,
      ...parsed.data,
      actorUserId: session.user.id,
      actorType: session.role,
    });
    return NextResponse.json({ balance, message: "تم تثبيت العهدة الفعلية بنجاح" }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر تثبيت العهدة");
  }
}
