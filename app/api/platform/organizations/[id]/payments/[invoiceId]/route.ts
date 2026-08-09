import { NextResponse } from "next/server";
import { parseJsonBody, requirePlatformApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { voidInvoice } from "@/lib/billing/billing-service";
import { toErrorResponse } from "@/lib/http/error-response";

/** إلغاء دفعة سُجّلت بالخطأ وإعادة حساب نهاية الفترة. */
export async function DELETE(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "platform") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { invoiceId } = await context.params;
  const body = await parseJsonBody<{ reason?: string }>(request);

  try {
    await voidInvoice(prisma, invoiceId, {
      recordedByPlatformAdminId: session.admin.id,
      reason: body.reason,
    });
    return NextResponse.json({ message: "تم إلغاء الدفعة وإعادة حساب الفترة" });
  } catch (error) {
    return toErrorResponse(error, "تعذر إلغاء الدفعة");
  }
}
