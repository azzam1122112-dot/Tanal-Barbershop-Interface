import { NextResponse } from "next/server";
import { requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { listProducts } from "@/lib/products/product-service";

/** منتجات فرع الحلاق المتاحة للبيع مع الزيارة. */
export async function GET() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const products = await listProducts(prisma, {
    organizationId: session.organizationId,
    salonIds: [session.salonId],
    onlyActive: true,
  });

  return NextResponse.json({
    // نخفي ما نفد مخزونه بدل عرضه ثم رفضه عند الحفظ.
    products: products
      .filter((product) => product.stockQuantity > 0)
      .map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        stockQuantity: product.stockQuantity,
      })),
  });
}
