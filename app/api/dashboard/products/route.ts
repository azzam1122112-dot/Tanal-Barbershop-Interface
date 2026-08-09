import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { assertSalonAllowed, effectiveSalonIds } from "@/lib/auth/salon-scope";
import { prisma } from "@/lib/db/prisma";
import { createProduct, listProducts } from "@/lib/products/product-service";
import { toErrorResponse } from "@/lib/http/error-response";

const createSchema = z.object({
  salonId: z.string().min(1, "الفرع مطلوب"),
  name: z.string().trim().min(2, "اسم المنتج مطلوب"),
  sku: z.string().trim().max(40).optional().nullable(),
  price: z.coerce.number().positive("السعر يجب أن يكون أكبر من صفر"),
  costPrice: z.coerce.number().min(0).optional().nullable(),
  stockQuantity: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  commissionRate: z.coerce.number().min(0).max(100).optional().nullable(),
});

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const products = await listProducts(prisma, {
    organizationId: session.organizationId,
    salonIds: effectiveSalonIds(session),
  });
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = createSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات المنتج غير صحيحة" }, { status: 400 });
  }

  try {
    assertSalonAllowed(session, parsed.data.salonId);
    const product = await createProduct(prisma, {
      organizationId: session.organizationId,
      salonId: parsed.data.salonId,
      name: parsed.data.name,
      sku: parsed.data.sku,
      price: parsed.data.price,
      costPrice: parsed.data.costPrice,
      stockQuantity: parsed.data.stockQuantity,
      lowStockThreshold: parsed.data.lowStockThreshold,
      commissionRate: parsed.data.commissionRate,
      actorUserId: session.user.id,
      actorType: session.role,
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر حفظ المنتج");
  }
}
