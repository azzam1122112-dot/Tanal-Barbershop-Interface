import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCustomerBookingSlots } from "@/lib/appointments/customer-booking";
import { resolveCustomerByPortalToken } from "@/lib/customers/customer-portal";
import { toErrorResponse } from "@/lib/http/error-response";

/**
 * الفترات المتاحة لعميل البوابة.
 *
 * مسار قراءة بلا جلسة — الهوية رمز البوابة. لا يكشف مواعيد أحد ولا أسماء
 * محجوزين: يعيد الفترات **المتاحة** فقط، فلا يُستدل منه على انشغال الصالون.
 */

const querySchema = z.object({
  salonId: z.string().trim().min(1, "الفرع مطلوب"),
  barberId: z.string().trim().min(1).optional(),
});

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const customer = await resolveCustomerByPortalToken(prisma, token);
  if (!customer) {
    return NextResponse.json({ message: "الرابط غير صالح" }, { status: 404 });
  }

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
