import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { resolveCustomerByPortalToken } from "@/lib/customers/customer-portal";
import { normalizeSaudiPhone, saudiPhoneInputSchema } from "@/lib/phone/saudi-phone";

const requestSchema = z.object({
  type: z.enum(["ACCESS", "COPY", "CORRECTION", "DELETION", "WITHDRAW_CONSENT"]),
  details: z.string().trim().max(1000, "التفاصيل طويلة جدًا").optional(),
  verificationPhone: saudiPhoneInputSchema,
  requestedName: z.string().trim().min(2).max(60).optional(),
  requestedPhone: saudiPhoneInputSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.type === "CORRECTION" && !data.requestedName && !data.requestedPhone) {
    ctx.addIssue({ code: "custom", message: "أدخل الاسم أو الجوال الجديد المطلوب تصحيحه" });
  }
});

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const customer = await resolveCustomerByPortalToken(prisma, token);
  if (!customer) return NextResponse.json({ message: "الرابط غير صالح أو منتهي" }, { status: 404 });

  const parsed = requestSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "الطلب غير صحيح" }, { status: 400 });

  let verificationPhone: string;
  let requestedPhone: string | undefined;
  try {
    verificationPhone = normalizeSaudiPhone(parsed.data.verificationPhone);
    requestedPhone = parsed.data.requestedPhone ? normalizeSaudiPhone(parsed.data.requestedPhone) : undefined;
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "رقم الجوال غير صحيح" }, { status: 400 });
  }
  if (verificationPhone !== customer.phone) {
    return NextResponse.json({ message: "تعذر التحقق من الهوية: الجوال لا يطابق صاحب البطاقة" }, { status: 403 });
  }

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
      requestedName: parsed.data.type === "CORRECTION" ? parsed.data.requestedName || null : null,
      requestedPhone: parsed.data.type === "CORRECTION" ? requestedPhone || null : null,
      identityVerifiedAt: new Date(),
      identityVerificationMethod: "PORTAL_TOKEN_AND_PHONE_MATCH",
    },
  });
  return NextResponse.json({ request: { id: created.id, type: created.type, status: created.status, createdAt: created.createdAt.toISOString(), identityVerifiedAt: created.identityVerifiedAt?.toISOString() ?? null } }, { status: 201 });
}
