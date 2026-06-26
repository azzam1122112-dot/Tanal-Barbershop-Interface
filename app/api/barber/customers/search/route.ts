import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { customerSearchSchema } from "@/lib/auth/validation";
import { requireBarberApi } from "@/lib/auth/http";
import { toCustomerSummary } from "@/lib/customers/customer-summary";
import { SAUDI_LOCAL_MOBILE_MESSAGE } from "@/lib/phone/saudi-phone";

export async function GET(request: Request) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = customerSearchSchema.safeParse({ phone: url.searchParams.get("phone") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ message: SAUDI_LOCAL_MOBILE_MESSAGE }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({
    where: { organizationId: session.organizationId, phone: parsed.data.phone },
    include: {
      loyaltyAccount: true,
      visits: {
        orderBy: { visitedAt: "desc" },
        take: 1,
        include: { barber: true, services: true },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ found: false, phone: parsed.data.phone });
  }

  return NextResponse.json({ found: true, customer: toCustomerSummary(customer) });
}
