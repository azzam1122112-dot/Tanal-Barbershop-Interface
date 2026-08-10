import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { assertSalonAllowed } from "@/lib/auth/salon-scope";
import { withdrawBranchSafe } from "@/lib/cash-custody/cash-custody-service";
import { prisma } from "@/lib/db/prisma";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({
  salonId: z.string().min(1),
  type: z.enum(["OWNER_PICKUP", "BANK_DEPOSIT"]),
  amount: z.coerce.number().positive(),
  note: z.string().trim().min(3).max(300),
  idempotencyKey: z.string().min(8).max(100),
});

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات السحب غير صحيحة" }, { status: 400 });
  try {
    assertSalonAllowed(session, parsed.data.salonId);
    const movement = await withdrawBranchSafe(prisma, {
      organizationId: session.organizationId,
      ...parsed.data,
      actorUserId: session.user.id,
      actorType: session.role,
    });
    return NextResponse.json({ movement, message: "تم تسجيل خروج الكاش من خزنة الفرع" }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر تسجيل حركة الخزنة");
  }
}
