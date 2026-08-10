import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { resolveCustomerByPortalToken } from "@/lib/customers/customer-portal";

const requestSchema = z.object({
  type: z.enum(["ACCESS", "COPY", "CORRECTION", "DELETION", "WITHDRAW_CONSENT"]),
  details: z.string().trim().max(1000, "التفاصيل طويلة جدًا").optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const customer = await resolveCustomerByPortalToken(prisma, token);
  if (!customer) return NextResponse.json({ message: "الرابط غير صالح أو منتهي" }, { status: 404 });

  const parsed = requestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "الطلب غير صحيح" }, { status: 400 });

  const meta = await getRequestMeta();
  const rate = await consumeRateLimit(prisma, `privacy-request:${customer.id}:${meta.ipAddress ?? "unknown"}`, undefined, {
    windowMs: 24 * 60 * 60_000,
    maxAttempts: 5,
    lockMs: 24 * 60 * 60_000,
  });
  if (rate.limited) return NextResponse.json({ message: "تم استلام طلباتك السابقة. حاول غدًا إذا احتجت طلبًا إضافيًا" }, { status: 429 });

  const existing = await prisma.dataSubjectRequest.count({
    where: { customerId: customer.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
  });
  if (existing >= 3) return NextResponse.json({ message: "لديك ثلاثة طلبات مفتوحة بالفعل" }, { status: 409 });

  const created = await prisma.dataSubjectRequest.create({
    data: {
      organizationId: customer.organizationId,
      customerId: customer.id,
      type: parsed.data.type,
      details: parsed.data.details || null,
    },
  });
  return NextResponse.json({ request: { id: created.id, type: created.type, status: created.status, createdAt: created.createdAt.toISOString() } }, { status: 201 });
}
