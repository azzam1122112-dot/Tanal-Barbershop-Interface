import { Prisma, type PrismaClient, type StockReportStatus, type StockReportType } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { recordStockMovement } from "@/lib/products/product-service";
import { writeAuditLog } from "@/lib/audit/audit-log";

/**
 * بلاغات مخزون الفرع.
 *
 * **بلاغ لا حركة:** الحلاق أقرب الناس إلى الرفّ، فهو أول من يرى النقص والتالف.
 * لكن خصمًا مباشرًا بيده يعني إخراج بضاعة بلا رقابة. لذلك يُسجَّل البلاغ ولا
 * يمسّ `stockQuantity`، ثم تعتمده الإدارة فتنشأ `StockMovement` مرتبطة به —
 * فيبقى القرار مربوطًا بأثره في الدفتر.
 */

type ReportPrisma = PrismaClient;

export const STOCK_REPORT_TYPE_LABELS: Record<StockReportType, string> = {
  LOW_STOCK: "قارب على النفاد",
  DAMAGED: "تالف",
  MISSING: "مفقود",
};

export const STOCK_REPORT_STATUS_LABELS: Record<StockReportStatus, string> = {
  OPEN: "بانتظار الإدارة",
  RESOLVED: "معتمد",
  DISMISSED: "مرفوض",
};

/** الأنواع التي تعني نقصًا فعليًا في الرفّ، فيصحّ اعتمادها كحركة خصم. */
const DEDUCTING_TYPES: StockReportType[] = ["DAMAGED", "MISSING"];

const reportInclude = {
  product: { select: { id: true, name: true, stockQuantity: true, lowStockThreshold: true } },
  barber: { select: { id: true, name: true } },
  salon: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
} satisfies Prisma.StockReportInclude;

export type StockReportRow = ReturnType<typeof toReportRow>;

export async function createStockReport(
  prisma: ReportPrisma,
  input: {
    organizationId: string;
    salonId: string;
    barberId: string;
    productId: string;
    type: StockReportType;
    quantity?: number | null;
    note?: string | null;
  },
) {
  // المنتج يُقرأ من فرع الحلاق نفسه: معرّف قادم من العميل لا يُصدَّق.
  const product = await prisma.product.findFirst({
    where: {
      id: input.productId,
      organizationId: input.organizationId,
      salonId: input.salonId,
      isActive: true,
    },
    select: { id: true, name: true, stockQuantity: true },
  });
  if (!product) throw new BusinessError("المنتج غير متاح في فرعك", 404);

  const quantity = normalizeQuantity(input.type, input.quantity, product.stockQuantity);

  // بلاغ مفتوح لنفس المنتج والنوع من نفس الحلاق لا يتكرر: قائمة الإدارة تمتلئ
  // بنسخ من الشكوى نفسها فتُهمل كلها.
  const duplicate = await prisma.stockReport.findFirst({
    where: {
      organizationId: input.organizationId,
      productId: product.id,
      barberId: input.barberId,
      type: input.type,
      status: "OPEN",
    },
    include: reportInclude,
  });
  if (duplicate) return toReportRow(duplicate);

  const created = await prisma.stockReport.create({
    data: {
      organizationId: input.organizationId,
      salonId: input.salonId,
      productId: product.id,
      barberId: input.barberId,
      type: input.type,
      quantity,
      note: input.note?.trim() || null,
    },
    include: reportInclude,
  });

  await writeAuditLog({
    prisma,
    organizationId: input.organizationId,
    salonId: input.salonId,
    actorType: "BARBER",
    actorBarberId: input.barberId,
    action: "stock_report.created",
    entityType: "StockReport",
    entityId: created.id,
    after: { productId: product.id, type: input.type, quantity },
  });

  return toReportRow(created);
}

export async function listStockReports(
  prisma: ReportPrisma,
  scope: {
    organizationId: string;
    salonIds?: string[] | null;
    barberId?: string | null;
    status?: StockReportStatus | null;
    take?: number;
  },
) {
  const reports = await prisma.stockReport.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(scope.salonIds?.length ? { salonId: { in: scope.salonIds } } : {}),
      ...(scope.barberId ? { barberId: scope.barberId } : {}),
      ...(scope.status ? { status: scope.status } : {}),
    },
    include: reportInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: scope.take ?? 50,
  });
  return reports.map(toReportRow);
}

/**
 * اعتماد البلاغ أو رفضه.
 *
 * الاعتماد لبلاغ تالف/مفقود يخصم الكمية بحركة `WASTE` موثقة باسم من اعتمدها،
 * أما «قارب على النفاد» فلا حركة له — هو تنبيه لا نقص وقع.
 */
export async function resolveStockReport(
  prisma: ReportPrisma,
  input: {
    organizationId: string;
    salonIds?: string[] | null;
    reportId: string;
    decision: "APPROVE" | "DISMISS";
    note?: string | null;
    actorUserId: string;
    actorType: "OWNER" | "ADMIN" | "SUPERVISOR";
  },
) {
  const report = await prisma.stockReport.findFirst({
    where: {
      id: input.reportId,
      organizationId: input.organizationId,
      ...(input.salonIds?.length ? { salonId: { in: input.salonIds } } : {}),
    },
    include: reportInclude,
  });
  if (!report) throw new BusinessError("البلاغ غير موجود", 404);
  if (report.status !== "OPEN") throw new BusinessError("تمّت معالجة هذا البلاغ مسبقًا", 409);

  if (input.decision === "DISMISS") {
    const dismissed = await prisma.stockReport.update({
      where: { id: report.id },
      data: {
        status: "DISMISSED",
        resolvedByUserId: input.actorUserId,
        resolvedAt: new Date(),
        resolutionNote: input.note?.trim() || null,
      },
      include: reportInclude,
    });
    await writeAudit(prisma, input, report.salonId, report.id, { decision: "DISMISS" });
    return toReportRow(dismissed);
  }

  let stockMovementId: string | null = null;
  if (DEDUCTING_TYPES.includes(report.type)) {
    const quantity = report.quantity ?? 0;
    if (quantity <= 0) throw new BusinessError("البلاغ بلا كمية — لا يمكن اعتماده كخصم", 409);

    const movement = await recordStockMovement(prisma, {
      productId: report.productId,
      organizationId: report.organizationId,
      type: "WASTE",
      quantity: -quantity,
      reason: `اعتماد بلاغ ${STOCK_REPORT_TYPE_LABELS[report.type]} من ${report.barber.name}`,
      recordedByUserId: input.actorUserId,
      salonIds: input.salonIds ?? undefined,
    });
    stockMovementId = movement.id;
  }

  const resolved = await prisma.stockReport.update({
    where: { id: report.id },
    data: {
      status: "RESOLVED",
      resolvedByUserId: input.actorUserId,
      resolvedAt: new Date(),
      resolutionNote: input.note?.trim() || null,
      stockMovementId,
    },
    include: reportInclude,
  });

  await writeAudit(prisma, input, report.salonId, report.id, {
    decision: "APPROVE",
    type: report.type,
    quantity: report.quantity,
    stockMovementId,
  });

  return toReportRow(resolved);
}

/**
 * «قارب على النفاد» بلاغ حالة لا كمية، فتُهمل. والتالف/المفقود بلا كمية
 * صحيحة بلاغ لا يمكن اعتماده لاحقًا، ولا تتجاوز الكمية ما هو مسجَّل في الرفّ.
 */
function normalizeQuantity(type: StockReportType, quantity: number | null | undefined, stockQuantity: number) {
  if (type === "LOW_STOCK") return null;

  const value = Math.trunc(Number(quantity ?? 0));
  if (!Number.isFinite(value) || value <= 0) {
    throw new BusinessError("اكتب الكمية المبلَّغ عنها");
  }
  if (value > stockQuantity) {
    throw new BusinessError(`الكمية المسجَّلة ${stockQuantity} فقط — راجع العدد قبل الإرسال`);
  }
  return value;
}

async function writeAudit(
  prisma: ReportPrisma,
  input: { organizationId: string; actorUserId: string; actorType: "OWNER" | "ADMIN" | "SUPERVISOR" },
  salonId: string,
  entityId: string,
  after: Record<string, unknown>,
) {
  await writeAuditLog({
    prisma,
    organizationId: input.organizationId,
    salonId,
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    action: "stock_report.resolved",
    entityType: "StockReport",
    entityId,
    after: JSON.parse(JSON.stringify(after)),
  });
}

function toReportRow(report: Prisma.StockReportGetPayload<{ include: typeof reportInclude }>) {
  return {
    id: report.id,
    type: report.type,
    typeLabel: STOCK_REPORT_TYPE_LABELS[report.type],
    status: report.status,
    statusLabel: STOCK_REPORT_STATUS_LABELS[report.status],
    quantity: report.quantity,
    note: report.note,
    createdAt: report.createdAt.toISOString(),
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    resolutionNote: report.resolutionNote,
    stockMovementId: report.stockMovementId,
    product: report.product,
    barber: report.barber,
    salon: report.salon,
    resolvedBy: report.resolvedBy,
  };
}
