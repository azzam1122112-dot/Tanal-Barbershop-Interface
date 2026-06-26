import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { parseJsonBody, requirePlatformApi } from "@/lib/auth/http";
import { updatePlan } from "@/lib/platform/platform-service";
import { toErrorResponse } from "@/lib/http/error-response";

const updateSchema = z.object({
  name: z.string().trim().min(2).optional(),
  priceMonthly: z.coerce.number().nonnegative().optional(),
  maxSalons: z.coerce.number().int().positive().optional(),
  maxBarbers: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformApi();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الباقة غير صحيحة" }, { status: 400 });
  }

  try {
    const plan = await updatePlan(prisma, id, parsed.data);
    return NextResponse.json({ plan: { id: plan.id, name: plan.name, isActive: plan.isActive } });
  } catch (error) {
    return toErrorResponse(error, "تعذر تحديث الباقة");
  }
}
