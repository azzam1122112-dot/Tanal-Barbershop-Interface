import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody, requireCommissionPayoutApi } from "@/lib/auth/http";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { reverseCommissionPayout } from "@/lib/commissions/commission-payout";
import { toErrorResponse } from "@/lib/http/error-response";

const reverseSchema = z.object({
  reason: z.string().trim().min(3, "اكتب سبب عكس الصرف بوضوح").max(300),
});

/** لا حذف لسند صرف: يُعكس بحركة موثقة تعيد المبلغ إلى متبقي الحلاق وإلى النقد. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireCommissionPayoutApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  if (session.role !== "OWNER" && session.role !== "ADMIN") {
    return NextResponse.json({ message: "صلاحية غير كافية" }, { status: 403 });
  }

  const { id } = await context.params;
  const parsed = reverseSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "سبب العكس غير صحيح" }, { status: 400 });
  }

  try {
    const payout = await reverseCommissionPayout(prisma, {
      organizationId: session.organizationId,
      salonIds: effectiveSalonIds(session),
      payoutId: id,
      reason: parsed.data.reason,
      actorUserId: session.user.id,
      actorType: session.role,
      auditMeta: await getRequestMeta(),
    });

    return NextResponse.json({ payout });
  } catch (error) {
    return toErrorResponse(error, "تعذر عكس صرف العمولة");
  }
}
