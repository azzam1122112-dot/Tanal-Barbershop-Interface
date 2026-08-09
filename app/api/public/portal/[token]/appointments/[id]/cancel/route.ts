import { NextResponse } from "next/server";
import { getRequestMeta } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { cancelCustomerAppointment } from "@/lib/appointments/customer-booking";
import { resolveCustomerByPortalToken } from "@/lib/customers/customer-portal";
import { toErrorResponse } from "@/lib/http/error-response";

/** إلغاء موعد من بوابة العميل — موعده هو فقط، وقبل بدء وقته. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await context.params;
  const customer = await resolveCustomerByPortalToken(prisma, token);
  if (!customer) {
    return NextResponse.json({ message: "الرابط غير صالح" }, { status: 404 });
  }

  const meta = await getRequestMeta();

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
