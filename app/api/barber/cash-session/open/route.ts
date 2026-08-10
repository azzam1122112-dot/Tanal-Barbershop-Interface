import { toErrorResponse } from "@/lib/http/error-response";
import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireBarberApi } from "@/lib/auth/http";
import { openCashSession } from "@/lib/cash-sessions/cash-session-service";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const openSchema = z.object({ openingCashAmount: z.coerce.number().nonnegative().default(0) });

export async function POST(request: Request) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  try {
    const parsed = openSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) return NextResponse.json({ message: "عهدة بداية الصندوق غير صحيحة" }, { status: 400 });
    const result = await openCashSession(prisma, {
      barberId: session.barber.id,
      openingCashAmount: parsed.data.openingCashAmount,
      auditMeta: await getRequestMeta(),
    });
    return NextResponse.json(result, { status: result.alreadyOpen ? 200 : 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر فتح جلسة الصندوق");
  }
}
