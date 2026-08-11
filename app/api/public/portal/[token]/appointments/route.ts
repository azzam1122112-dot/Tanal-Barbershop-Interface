import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestMeta, parseJsonBody } from "@/lib/auth/http";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { bookCustomerAppointment, listCustomerAppointments } from "@/lib/appointments/customer-booking";
import { resolveCustomerByPortalToken } from "@/lib/customers/customer-portal";
import { toErrorResponse } from "@/lib/http/error-response";
import { MAX_APPOINTMENT_SERVICES } from "@/lib/appointments/appointment-duration";

/** حجز موعد من بوابة العميل. */

const bookSchema = z.object({
  salonId: z.string().trim().min(1, "الفرع مطلوب"),
  barberId: z.string().trim().min(1).nullish(),
  startAt: z.string().trim().min(1, "اختر وقتًا"),
  // معرّفات فقط — المدة تُشتقّ في الخادم من الكتالوج ولا تُقبل من الطلب.
  serviceIds: z.array(z.string().trim().min(1)).max(MAX_APPOINTMENT_SERVICES).default([]),
  notes: z.string().trim().max(200).nullish(),
});

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const meta = await getRequestMeta();
  const publicLimit = await consumeRateLimit(prisma, `portal-public:${meta.ipAddress ?? "unknown"}`, undefined, {
    windowMs: 5 * 60_000, maxAttempts: 120, lockMs: 5 * 60_000,
  });
  if (publicLimit.limited) return NextResponse.json({ message: "طلبات كثيرة. حاول بعد قليل." }, { status: 429, headers: { "Retry-After": String(publicLimit.retryAfterSeconds) } });
  const { token } = await context.params;
  const customer = await resolveCustomerByPortalToken(prisma, token);
  if (!customer) {
    return NextResponse.json({ message: "الرابط غير صالح" }, { status: 404 });
  }
  const limit = await consumeRateLimit(prisma, `portal-read:${customer.id}:${meta.ipAddress ?? "unknown"}`, undefined, {
    windowMs: 5 * 60_000, maxAttempts: 60, lockMs: 5 * 60_000,
  });
  if (limit.limited) return NextResponse.json({ message: "طلبات كثيرة. حاول بعد قليل." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const appointments = await listCustomerAppointments(prisma, {
    organizationId: customer.organizationId,
    customerId: customer.id,
  });
  return NextResponse.json({ appointments });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const meta = await getRequestMeta();
  const publicLimit = await consumeRateLimit(prisma, `portal-public:${meta.ipAddress ?? "unknown"}`, undefined, {
    windowMs: 5 * 60_000, maxAttempts: 120, lockMs: 5 * 60_000,
  });
  if (publicLimit.limited) return NextResponse.json({ message: "طلبات كثيرة. حاول بعد قليل." }, { status: 429, headers: { "Retry-After": String(publicLimit.retryAfterSeconds) } });
  const { token } = await context.params;
  const customer = await resolveCustomerByPortalToken(prisma, token);
  if (!customer) {
    return NextResponse.json({ message: "الرابط غير صالح" }, { status: 404 });
  }

  // الحد بالعميل لا بالـ IP: عائلة على شبكة واحدة تحجز من نفس العنوان،
  // وقفلهم جميعًا بفعل واحد منهم خطأ تشغيلي لا حماية.
  const limit = await consumeRateLimit(prisma, `portal-booking:${customer.id}:${meta.ipAddress ?? "unknown"}`, undefined, {
    windowMs: 15 * 60_000, maxAttempts: 10, lockMs: 15 * 60_000,
  });
  if (limit.limited) {
    return NextResponse.json(
      { message: "محاولات كثيرة. حاول بعد قليل." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bookSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }, { status: 400 });
  }

  try {
    const appointment = await bookCustomerAppointment(prisma, {
      organizationId: customer.organizationId,
      customerId: customer.id,
      salonId: parsed.data.salonId,
      barberId: parsed.data.barberId ?? null,
      startAt: parsed.data.startAt,
      serviceIds: parsed.data.serviceIds,
      notes: parsed.data.notes ?? null,
      ipAddress: meta.ipAddress,
    });
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر تأكيد الحجز");
  }
}
