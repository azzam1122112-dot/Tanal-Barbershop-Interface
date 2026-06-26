import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { customerCreateSchema } from "@/lib/auth/validation";
import { getRequestMeta, parseJsonBody, requireBarberApi } from "@/lib/auth/http";
import { createCustomerWithLoyalty } from "@/lib/customers/customer-service";
import { toCustomerSummary } from "@/lib/customers/customer-summary";
import { writeAuditLog } from "@/lib/audit/audit-log";

export async function POST(request: Request) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  const parsed = customerCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات العميل غير صحيحة" }, { status: 400 });
  }

  const result = await createCustomerWithLoyalty({
    prisma,
    organizationId: session.organizationId,
    name: parsed.data.name,
    phone: parsed.data.phone,
    createdByBarberId: session.barber.id,
  });
  const meta = await getRequestMeta();

  await writeAuditLog({
    prisma,
    actorType: "BARBER",
    actorBarberId: session.barber.id,
    action: result.created ? "customer.created" : "customer.create_duplicate",
    entityType: "Customer",
    entityId: result.customer.id,
    after: toCustomerSummary(result.customer),
    ...meta,
  });

  return NextResponse.json(
    {
      created: result.created,
      customer: toCustomerSummary(result.customer),
      message: result.created ? "تم إنشاء العميل" : "العميل موجود مسبقًا",
    },
    { status: result.created ? 201 : 200 },
  );
}
