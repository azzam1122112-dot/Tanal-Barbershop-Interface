import { Prisma, type PrismaClient, type StockMovement, type StockMovementType } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { roundMoney } from "@/lib/visits/visit-totals";

type ProductPrisma = PrismaClient | Prisma.TransactionClient;

export const STOCK_MOVEMENT_LABELS: Record<StockMovementType, string> = {
  PURCHASE: "توريد",
  SALE: "بيع",
  ADJUSTMENT: "جرد/تسوية",
  WASTE: "تالف",
  RETURN: "إرجاع",
};

export type ProductRow = ReturnType<typeof toProductRow>;

export async function listProducts(
  prisma: ProductPrisma,
  scope: { organizationId: string; salonIds?: string[] | null; onlyActive?: boolean },
) {
  const products = await prisma.product.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(scope.salonIds && scope.salonIds.length > 0 ? { salonId: { in: scope.salonIds } } : {}),
      ...(scope.onlyActive ? { isActive: true } : {}),
    },
    include: { salon: { select: { id: true, name: true } } },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return products.map(toProductRow);
}

export async function createProduct(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    salonId: string;
    name: string;
    sku?: string | null;
    price: number;
    costPrice?: number | null;
    stockQuantity?: number;
    lowStockThreshold?: number;
    commissionRate?: number | null;
    actorUserId: string;
    actorType: "OWNER" | "ADMIN" | "SUPERVISOR";
  },
) {
  const salon = await prisma.salon.findFirst({
    where: { id: input.salonId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!salon) throw new BusinessError("الفرع غير موجود", 404);

  const openingStock = Math.max(0, Math.trunc(input.stockQuantity ?? 0));

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        name: input.name.trim(),
        sku: input.sku?.trim() || null,
        price: roundMoney(input.price),
        costPrice: input.costPrice == null ? null : roundMoney(input.costPrice),
        stockQuantity: openingStock,
        lowStockThreshold: Math.max(0, Math.trunc(input.lowStockThreshold ?? 3)),
        commissionRate: input.commissionRate ?? null,
      },
      include: { salon: { select: { id: true, name: true } } },
    });

    // الرصيد الافتتاحي حركة مثل غيره — لا رقم يظهر بلا مصدر.
    if (openingStock > 0) {
      await tx.stockMovement.create({
        data: {
          organizationId: input.organizationId,
          salonId: input.salonId,
          productId: product.id,
          type: "PURCHASE",
          quantity: openingStock,
          balanceAfter: openingStock,
          reason: "رصيد افتتاحي",
          recordedByUserId: input.actorUserId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        action: "product.created",
        entityType: "Product",
        entityId: product.id,
        after: { name: product.name, price: Number(product.price), stockQuantity: openingStock },
      },
    });

    return toProductRow(product);
  });
}

export async function updateProduct(
  prisma: PrismaClient,
  productId: string,
  data: Partial<{
    name: string;
    sku: string | null;
    price: number;
    costPrice: number | null;
    lowStockThreshold: number;
    commissionRate: number | null;
    isActive: boolean;
    sortOrder: number;
  }>,
  scope: { organizationId: string; salonIds?: string[] | null; actorUserId: string; actorType: "OWNER" | "ADMIN" | "SUPERVISOR" },
) {
  const before = await prisma.product.findFirst({
    where: {
      id: productId,
      organizationId: scope.organizationId,
      ...(scope.salonIds && scope.salonIds.length > 0 ? { salonId: { in: scope.salonIds } } : {}),
    },
  });
  if (!before) throw new BusinessError("المنتج غير موجود", 404);

  // الكمية لا تُعدَّل هنا — كل تغيير في المخزون يمر عبر حركة مسجّلة.
  const product = await prisma.product.update({
    where: { id: before.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.sku !== undefined ? { sku: data.sku?.trim() || null } : {}),
      ...(data.price !== undefined ? { price: roundMoney(data.price) } : {}),
      ...(data.costPrice !== undefined ? { costPrice: data.costPrice == null ? null : roundMoney(data.costPrice) } : {}),
      ...(data.lowStockThreshold !== undefined ? { lowStockThreshold: Math.max(0, Math.trunc(data.lowStockThreshold)) } : {}),
      ...(data.commissionRate !== undefined ? { commissionRate: data.commissionRate } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    },
    include: { salon: { select: { id: true, name: true } } },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: scope.organizationId,
      salonId: before.salonId,
      actorType: scope.actorType,
      actorUserId: scope.actorUserId,
      action: "product.updated",
      entityType: "Product",
      entityId: product.id,
      before: { name: before.name, price: Number(before.price), isActive: before.isActive },
      after: { name: product.name, price: Number(product.price), isActive: product.isActive },
    },
  });

  return toProductRow(product);
}

/**
 * يسجّل حركة مخزون ويحدّث الرصيد ذرّيًا.
 * `quantity` موجب للإدخال وسالب للإخراج. الرصيد لا يُسمح له بالنزول تحت الصفر.
 */
export async function recordStockMovement(
  prisma: ProductPrisma,
  input: {
    productId: string;
    organizationId: string;
    type: StockMovementType;
    quantity: number;
    reason?: string | null;
    visitId?: string | null;
    recordedByUserId?: string | null;
    recordedByBarberId?: string | null;
    salonIds?: string[] | null;
  },
): Promise<StockMovement> {
  if ("$transaction" in prisma) {
    return runSerializableProductTransaction(prisma, (tx) => recordStockMovement(tx, input));
  }

  const quantity = Math.trunc(input.quantity);
  if (quantity === 0) throw new BusinessError("الكمية يجب ألا تكون صفرًا");

  const product = await prisma.product.findFirst({
    where: {
      id: input.productId,
      organizationId: input.organizationId,
      ...(input.salonIds && input.salonIds.length > 0 ? { salonId: { in: input.salonIds } } : {}),
    },
    select: { id: true, name: true, salonId: true, stockQuantity: true },
  });
  if (!product) throw new BusinessError("المنتج غير موجود", 404);

  const balanceAfter = product.stockQuantity + quantity;
  if (balanceAfter < 0) {
    throw new BusinessError(`الكمية المتاحة من ${product.name} هي ${product.stockQuantity} فقط`, 409);
  }

  await prisma.product.update({
    where: { id: product.id },
    data: { stockQuantity: balanceAfter },
  });

  return prisma.stockMovement.create({
    data: {
      organizationId: input.organizationId,
      salonId: product.salonId,
      productId: product.id,
      type: input.type,
      quantity,
      balanceAfter,
      reason: input.reason?.trim() || null,
      visitId: input.visitId ?? null,
      recordedByUserId: input.recordedByUserId ?? null,
      recordedByBarberId: input.recordedByBarberId ?? null,
    },
  });
}

async function runSerializableProductTransaction<T>(
  prisma: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
  throw new BusinessError("تعذر تسجيل حركة المخزون بعد عدة محاولات");
}

export async function getStockMovements(
  prisma: ProductPrisma,
  scope: { organizationId: string; salonIds?: string[] | null; productId?: string | null },
) {
  const movements = await prisma.stockMovement.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(scope.salonIds && scope.salonIds.length > 0 ? { salonId: { in: scope.salonIds } } : {}),
      ...(scope.productId ? { productId: scope.productId } : {}),
    },
    include: { product: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return movements.map((movement) => ({
    id: movement.id,
    productId: movement.productId,
    productName: movement.product.name,
    type: movement.type,
    typeLabel: STOCK_MOVEMENT_LABELS[movement.type],
    quantity: movement.quantity,
    balanceAfter: movement.balanceAfter,
    reason: movement.reason,
    visitId: movement.visitId,
    createdAt: movement.createdAt.toISOString(),
  }));
}

/** المنتجات التي بلغت حد إعادة الطلب أو نفدت. */
export async function getLowStockProducts(
  prisma: ProductPrisma,
  scope: { organizationId: string; salonIds?: string[] | null },
) {
  const products = await prisma.product.findMany({
    where: {
      organizationId: scope.organizationId,
      isActive: true,
      ...(scope.salonIds && scope.salonIds.length > 0 ? { salonId: { in: scope.salonIds } } : {}),
    },
    include: { salon: { select: { name: true } } },
    orderBy: { stockQuantity: "asc" },
  });

  return products
    .filter((product) => product.stockQuantity <= product.lowStockThreshold)
    .map((product) => ({
      id: product.id,
      name: product.name,
      salonName: product.salon.name,
      stockQuantity: product.stockQuantity,
      lowStockThreshold: product.lowStockThreshold,
      isOutOfStock: product.stockQuantity <= 0,
    }));
}

function toProductRow(
  product: Prisma.ProductGetPayload<{ include: { salon: { select: { id: true; name: true } } } }>,
) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    price: Number(product.price),
    costPrice: product.costPrice == null ? null : Number(product.costPrice),
    stockQuantity: product.stockQuantity,
    lowStockThreshold: product.lowStockThreshold,
    commissionRate: product.commissionRate == null ? null : Number(product.commissionRate),
    isActive: product.isActive,
    sortOrder: product.sortOrder,
    salon: { id: product.salon.id, name: product.salon.name },
    isLowStock: product.stockQuantity <= product.lowStockThreshold,
  };
}
