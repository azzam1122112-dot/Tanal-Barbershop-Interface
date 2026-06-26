import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireDashboardApi } from "@/lib/auth/http";
import { toCustomerSummary } from "@/lib/customers/customer-summary";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      loyaltyAccount: true,
      visits: {
        orderBy: { visitedAt: "desc" },
        take: 5,
        include: { barber: true, services: true },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ message: "العميل غير موجود" }, { status: 404 });
  }

  return NextResponse.json({ customer: toCustomerSummary(customer) });
}
