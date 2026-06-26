import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireBarberApi } from "@/lib/auth/http";
import { toCustomerSummary } from "@/lib/customers/customer-summary";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

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

  return NextResponse.json({
    customer: toCustomerSummary({
      ...customer,
      visits: customer.visits.slice(0, 1),
    }),
    visits: customer.visits.map((visit) => ({
      id: visit.id,
      visitedAt: visit.visitedAt.toISOString(),
      barberName: visit.barber.name,
      services: visit.services.map((service) => service.serviceName),
      netAmount: Number(visit.netAmount),
      paymentMethod: visit.paymentMethod,
    })),
  });
}
