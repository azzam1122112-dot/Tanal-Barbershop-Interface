import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { parseJsonBody, requirePlatformApi } from "@/lib/auth/http";
import { createPlan, listPlans } from "@/lib/platform/platform-service";
import { toErrorResponse } from "@/lib/http/error-response";

const createSchema = z.object({
  name: z.string().trim().min(2, "اسم الباقة مطلوب"),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "معرّف الباقة غير صحيح"),
  priceMonthly: z.coerce.number().nonnegative().default(0),
  maxSalons: z.coerce.number().int().positive("عدد الصالونات يجب أن يكون أكبر من صفر"),
  maxBarbers: z.coerce.number().int().positive().nullable().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export async function GET() {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;
  return NextResponse.json({ plans: await listPlans(prisma) });
}

export async function POST(request: Request) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;

  const parsed = createSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات الباقة غير صحيحة" }, { status: 400 });
  }

  try {
    const plan = await createPlan(prisma, parsed.data);
    return NextResponse.json({ plan: { id: plan.id, name: plan.name, slug: plan.slug } }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر إنشاء الباقة");
  }
}
