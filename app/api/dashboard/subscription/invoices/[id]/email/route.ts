import { NextResponse } from "next/server";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { deliverSubscriptionInvoiceEmail } from "@/lib/billing/subscription-invoice-delivery";
import { prisma } from "@/lib/db/prisma";
import { toErrorResponse } from "@/lib/http/error-response";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession();
  if (!session) return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  if (!canAccessDashboard(session) || session.type !== "dashboard" || session.role === "SUPERVISOR") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 403 });
  }

  const { id } = await context.params;
  try {
    const email = await deliverSubscriptionInvoiceEmail(prisma, session.organizationId, id);
    return NextResponse.json({ email, message: email.message }, { status: email.sent ? 200 : 502 });
  } catch (error) {
    return toErrorResponse(error, "تعذر إرسال الفاتورة");
  }
}
