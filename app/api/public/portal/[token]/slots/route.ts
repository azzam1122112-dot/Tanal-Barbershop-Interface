import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerBookingSlots } from "@/lib/appointments/customer-booking";
import { resolveCustomerByPortalToken } from "@/lib/customers/customer-portal";
import { toErrorResponse } from "@/lib/http/error-response";
import { getRequestMeta } from "@/lib/auth/http";
import { consumeRateLimit } from "@/lib/auth/rate-limit";

/**
 * الفترات المتاحة لعميل البوابة.
 *
 * مسار قراءة بلا جلسة — الهوية رمز البوابة. يعيد حالة الوقت فقط
 * (متاح/محجوز/قبل المهلة/خارج الدوام) من دون اسم أو جوال صاحب الحجز.
 */

const querySchema = z.object({
  salonId: z.string().trim().min(1, "الفرع مطلوب"),
  barberId: z.string().trim().min(1).optional(),
});

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
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
  const limit = await consumeRateLimit(prisma, `portal-slots:${customer.id}:${meta.ipAddress ?? "unknown"}`, undefined, {
    windowMs: 5 * 60_000, maxAttempts: 60, lockMs: 5 * 60_000,
  });
  if (limit.limited) return NextResponse.json({ message: "طلبات كثيرة. حاول بعد قليل." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    salonId: url.searchParams.get("salonId") ?? "",
    barberId: url.searchParams.get("barberId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" }, { status: 400 });
  }

  try {
    const result = await getCustomerBookingSlots(prisma, {
      organizationId: customer.organizationId,
      salonId: parsed.data.salonId,
      barberId: parsed.data.barberId ?? null,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "تعذر جلب الأوقات المتاحة");
  }
}
