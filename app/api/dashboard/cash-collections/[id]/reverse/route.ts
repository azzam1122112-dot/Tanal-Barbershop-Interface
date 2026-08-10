import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { reverseCashCollection } from "@/lib/cash-custody/cash-custody-service";
import { prisma } from "@/lib/db/prisma";
import { toErrorResponse } from "@/lib/http/error-response";

const schema = z.object({ reason: z.string().trim().min(3, "اكتب سبب عكس التحصيل").max(300) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  const parsed = schema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "سبب العكس مطلوب" }, { status: 400 });
  try {
    const { id } = await context.params;
    const collection = await reverseCashCollection(prisma, {
      organizationId: session.organizationId,
      salonIds: effectiveSalonIds(session),
      collectionId: id,
      reason: parsed.data.reason,
      actorUserId: session.user.id,
      actorType: session.role,
    });
    return NextResponse.json({ collection, message: "تم عكس التحصيل وإعادة المبلغ لعهدة الحلاق" });
  } catch (error) {
    return toErrorResponse(error, "تعذر عكس التحصيل");
  }
}
