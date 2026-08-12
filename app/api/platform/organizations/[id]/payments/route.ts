import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requirePlatformApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { listInvoices, recordManualPayment } from "@/lib/billing/billing-service";
import { deliverSubscriptionInvoiceEmail } from "@/lib/billing/subscription-invoice-delivery";
import { toErrorResponse } from "@/lib/http/error-response";

const paymentSchema = z.object({
  planId: z.string().trim().min(1).optional().nullable(),
  amount: z.coerce.number().min(0, "المبلغ لا يمكن أن يكون سالبًا"),
  periodMonths: z.coerce.number().int().min(1, "المدة شهر واحد على الأقل").max(36),
  provider: z.enum(["MANUAL_TRANSFER", "MANUAL_CASH"]),
  reference: z.string().trim().max(80).optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const invoices = await listInvoices(prisma, id);
  return NextResponse.json({ invoices });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "platform") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const parsed = paymentSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات الدفعة غير صحيحة" }, { status: 400 });
  }

  try {
    const invoice = await recordManualPayment(prisma, {
      organizationId: id,
      planId: parsed.data.planId,
      amount: parsed.data.amount,
      periodMonths: parsed.data.periodMonths,
      provider: parsed.data.provider,
      reference: parsed.data.reference,
      note: parsed.data.note,
      recordedByPlatformAdminId: session.admin.id,
    });
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
        ? "تم تفعيل الاشتراك وإرسال الفاتورة إلى البريد المسجّل"
        : `تم تفعيل الاشتراك، لكن ${email.message}`,
    }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر تسجيل الدفعة");
  }
}
