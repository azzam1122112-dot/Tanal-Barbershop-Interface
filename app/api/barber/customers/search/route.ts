import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { customerSearchSchema } from "@/lib/auth/validation";
import { requireBarberApi } from "@/lib/auth/http";
import { toCustomerSummary } from "@/lib/customers/customer-summary";

export async function GET(request: Request) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const parsed = customerSearchSchema.safeParse({ phone: url.searchParams.get("phone") ?? "" });

  if (!parsed.success) {
    return NextResponse.json({ message: "رقم الجوال السعودي غير صحيح" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({
    where: { phone: parsed.data.phone },
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
