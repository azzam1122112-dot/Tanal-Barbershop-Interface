import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireDashboardApi } from "@/lib/auth/http";
import { toCustomerDashboardRow } from "@/lib/customers/customer-summary";

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const status = url.searchParams.get("status") ?? "all";

  const customers = await prisma.customer.findMany({
    where: {
      organizationId: session.organizationId,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q.replace(/^\+/, "") } },
            ],
          }
        : {}),
      ...(status === "new" ? { visitCount: 0 } : {}),
      ...(status === "visited" ? { visitCount: { gt: 0 } } : {}),
    },
    include: { loyaltyAccount: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ customers: customers.map(toCustomerDashboardRow) });
}
