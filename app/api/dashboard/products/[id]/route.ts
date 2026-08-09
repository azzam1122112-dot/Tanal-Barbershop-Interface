import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { prisma } from "@/lib/db/prisma";
import { updateProduct } from "@/lib/products/product-service";
import { toErrorResponse } from "@/lib/http/error-response";

const patchSchema = z.object({
  name: z.string().trim().min(2).optional(),
  sku: z.string().trim().max(40).nullable().optional(),
  price: z.coerce.number().positive().optional(),
  costPrice: z.coerce.number().min(0).nullable().optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  commissionRate: z.coerce.number().min(0).max(100).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات المنتج غير صحيحة" }, { status: 400 });
  }

  try {
    const product = await updateProduct(prisma, id, parsed.data, {
      organizationId: session.organizationId,
      salonIds: effectiveSalonIds(session),
      actorUserId: session.user.id,
      actorType: session.role,
    });
    return NextResponse.json({ product });
  } catch (error) {
    return toErrorResponse(error, "تعذر تحديث المنتج");
  }
}
