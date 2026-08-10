import { NextResponse } from "next/server";
import { getRequestMeta } from "@/lib/auth/http";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { cancelCustomerAppointment } from "@/lib/appointments/customer-booking";
import { resolveCustomerByPortalToken } from "@/lib/customers/customer-portal";
import { toErrorResponse } from "@/lib/http/error-response";

/** إلغاء موعد من بوابة العميل — موعده هو فقط، وقبل بدء وقته. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string; id: string }> },
) {
  const meta = await getRequestMeta();
  const publicLimit = await consumeRateLimit(prisma, `portal-public:${meta.ipAddress ?? "unknown"}`, undefined, {
    windowMs: 5 * 60_000, maxAttempts: 120, lockMs: 5 * 60_000,
  });
  if (publicLimit.limited) return NextResponse.json({ message: "طلبات كثيرة. حاول بعد قليل." }, { status: 429, headers: { "Retry-After": String(publicLimit.retryAfterSeconds) } });
  const { token, id } = await context.params;
  const customer = await resolveCustomerByPortalToken(prisma, token);
  if (!customer) {
    return NextResponse.json({ message: "الرابط غير صالح" }, { status: 404 });
  }

  const limit = await consumeRateLimit(prisma, `portal-cancel:${customer.id}:${meta.ipAddress ?? "unknown"}`, undefined, {
    windowMs: 15 * 60_000, maxAttempts: 10, lockMs: 15 * 60_000,
  });
  if (limit.limited) return NextResponse.json({ message: "طلبات كثيرة. حاول بعد قليل." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  try {
    const appointment = await cancelCustomerAppointment(prisma, {
      organizationId: customer.organizationId,
      customerId: customer.id,
      appointmentId: id,
      ipAddress: meta.ipAddress,
    });
    return NextResponse.json({ appointment });
  } catch (error) {
    return toErrorResponse(error, "تعذر إلغاء الموعد");
  }
}
