import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { prisma } from "@/lib/db/prisma";
import { listProducts, recordStockMovement } from "@/lib/products/product-service";
import { toErrorResponse } from "@/lib/http/error-response";

const stockSchema = z.object({
  type: z.enum(["PURCHASE", "ADJUSTMENT", "WASTE", "RETURN"]),
  quantity: z.coerce.number().int(),
  reason: z.string().trim().max(200).optional().nullable(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const parsed = stockSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الحركة غير صحيحة" }, { status: 400 });
  }

  try {
    const salonIds = effectiveSalonIds(session);
    await recordStockMovement(prisma, {
      productId: id,
      organizationId: session.organizationId,
      type: parsed.data.type,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      recordedByUserId: session.user.id,
      salonIds,
    });

    const products = await listProducts(prisma, { organizationId: session.organizationId, salonIds });
    return NextResponse.json({ product: products.find((product) => product.id === id) ?? null });
  } catch (error) {
    return toErrorResponse(error, "تعذر تسجيل حركة المخزون");
  }
}
