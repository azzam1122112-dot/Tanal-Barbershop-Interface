import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireAdminApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { requestSubscriptionPayment } from "@/lib/billing/billing-service";
import { toErrorResponse } from "@/lib/http/error-response";

const requestSchema = z.object({
  planId: z.string().trim().min(1, "اختر الباقة"),
  periodMonths: z.union([z.literal(1), z.literal(12)]),
  reference: z.string().trim().min(3, "أدخل مرجع التحويل").max(80),
});

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = requestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات الدفع غير صحيحة" }, { status: 400 });
  }

  try {
    const invoice = await requestSubscriptionPayment(prisma, {
      organizationId: session.organizationId,
      planId: parsed.data.planId,
      periodMonths: parsed.data.periodMonths,
      reference: parsed.data.reference,
      actorType: session.role === "OWNER" ? "OWNER" : "ADMIN",
      actorUserId: session.user.id,
    });
    return NextResponse.json({ invoice, message: "تم إرسال طلب الدفع للمراجعة" }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر إرسال طلب الدفع");
  }
}
