import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requirePlatformApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { approvePaymentRequest, rejectPaymentRequest, voidInvoice } from "@/lib/billing/billing-service";
import { deliverSubscriptionInvoiceEmail } from "@/lib/billing/subscription-invoice-delivery";
import { toErrorResponse } from "@/lib/http/error-response";

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(300).optional().nullable(),
});

/** مراجعة طلب دفع مقدّم من المؤسسة. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string; invoiceId: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "platform") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = reviewSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: "إجراء المراجعة غير صحيح" }, { status: 400 });
  const { id, invoiceId } = await context.params;

  try {
    if (parsed.data.action === "APPROVE") {
      const invoice = await approvePaymentRequest(prisma, invoiceId, session.admin.id);
      const email = await deliverSubscriptionInvoiceEmail(prisma, id, invoice.id);
      return NextResponse.json({
        invoice: {
          ...invoice,
          invoiceEmailRecipient: email.recipient,
          invoiceEmailSentAt: email.sent ? new Date().toISOString() : null,
          invoiceEmailLastError: email.sent ? null : email.message,
        },
        email,
        message: email.sent
          ? "تم اعتماد الدفعة وتفعيل الاشتراك وإرسال الفاتورة"
          : `تم اعتماد الدفعة وتفعيل الاشتراك، لكن ${email.message}`,
      });
    }
    await rejectPaymentRequest(prisma, invoiceId, {
      platformAdminId: session.admin.id,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ message: "تم رفض طلب الدفع" });
  } catch (error) {
    return toErrorResponse(error, "تعذر مراجعة طلب الدفع");
  }
}

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
