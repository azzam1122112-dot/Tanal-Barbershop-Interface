import { NextResponse } from "next/server";
import { requirePlatformApi } from "@/lib/auth/http";
import { deliverSubscriptionInvoiceEmail } from "@/lib/billing/subscription-invoice-delivery";
import { prisma } from "@/lib/db/prisma";
import { toErrorResponse } from "@/lib/http/error-response";

export async function POST(_request: Request, context: { params: Promise<{ id: string; invoiceId: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  const { id, invoiceId } = await context.params;

  try {
    const email = await deliverSubscriptionInvoiceEmail(prisma, id, invoiceId);
    return NextResponse.json({ email, message: email.message }, { status: email.sent ? 200 : 502 });
  } catch (error) {
    return toErrorResponse(error, "تعذر إعادة إرسال الفاتورة");
  }
}
