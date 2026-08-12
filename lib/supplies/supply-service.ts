import { Prisma, type PrismaClient, type SupplyStatus } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit/audit-log";

/**
 * المستلزمات التشغيلية: أمواس، رغوة، مناشف، مطهّر.
 *
 * **لا يمسّ المال إطلاقًا.** لا سعر ولا تكلفة ولا كمية تُحاسب ولا حركة مخزون:
 * قناة تشغيلية بحتة بين من يقف عند الكرسي ومن يشتري للفرع. أي ربط بالفاتورة
 * أو بالمصروف يعيد المشكلة التي فُصل هذا الكيان لأجلها.
 *
 * **البلاغ حالة فرع لا حالة حلاق.** أول من يبلّغ يفتح البلاغ، وبقية حلاقي
 * الفرع يرون أنه بُلِّغ فلا يكرّرونه — تفرضه قاعدة البيانات بفهرس فريد جزئي
 * على البلاغات المفتوحة، لا فحصٌ في الشيفرة وحدها.
 */

type SupplyPrisma = PrismaClient;

export const SUPPLY_STATUS_LABELS: Record<SupplyStatus, string> = {
  AVAILABLE: "متوفر",
  LOW: "قارب على النفاد",
  OUT: "نفد",
};

/** ترتيب الشدّة: بلاغ «نفد» يرفع حالة صنف مُبلَّغ عنه «قارب»، ولا يخفضها العكس. */
const SEVERITY: Record<SupplyStatus, number> = { AVAILABLE: 0, LOW: 1, OUT: 2 };

const itemInclude = {
  salon: { select: { id: true, name: true } },
  reports: {
    where: { state: "OPEN" as const },
    take: 1,
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      status: true,
      note: true,
      createdAt: true,
      barber: { select: { id: true, name: true } },
      escalatedBy: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.SupplyItemInclude;

export type SupplyItemRow = ReturnType<typeof toItemRow>;

export async function listSupplyItems(
  prisma: SupplyPrisma,
  scope: { organizationId: string; salonIds?: string[] | null; onlyActive?: boolean },
) {
  const items = await prisma.supplyItem.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(scope.salonIds?.length ? { salonId: { in: scope.salonIds } } : {}),
      ...(scope.onlyActive ? { isActive: true } : {}),
    },
    include: itemInclude,
    // الناقص أولًا: الشاشة تبدأ بما يحتاج قرارًا لا بأول الحروف.
    orderBy: [{ isActive: "desc" }, { status: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return items.map(toItemRow);
}

export async function createSupplyItem(
  prisma: SupplyPrisma,
  input: {
    organizationId: string;
    salonId: string;
    salonIds?: string[] | null;
    name: string;
    unit?: string | null;
    sortOrder?: number;
    actorUserId: string;
    actorType: "OWNER" | "ADMIN" | "SUPERVISOR";
  },
) {
  assertSalonInScope(input.salonId, input.salonIds);
  const name = input.name.trim();
  if (name.length < 2) throw new BusinessError("اسم الصنف مطلوب");

  const salon = await prisma.salon.findFirst({
    where: { id: input.salonId, organizationId: input.organizationId, isActive: true },
    select: { id: true },
  });
  if (!salon) throw new BusinessError("الفرع غير موجود", 404);

  const duplicate = await prisma.supplyItem.findFirst({
    where: { salonId: input.salonId, name },
    select: { id: true },
  });
  if (duplicate) throw new BusinessError("الصنف مسجّل في هذا الفرع مسبقًا", 409);

  const created = await prisma.supplyItem.create({
    data: {
      organizationId: input.organizationId,
      salonId: input.salonId,
      name,
      unit: input.unit?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
    include: itemInclude,
  });

  await writeAuditLog({
    prisma,
    organizationId: input.organizationId,
    salonId: input.salonId,
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    action: "supply_item.created",
    entityType: "SupplyItem",
    entityId: created.id,
    after: { name, unit: created.unit },
  });

  return toItemRow(created);
}

export async function updateSupplyItem(
  prisma: SupplyPrisma,
  input: {
    organizationId: string;
    salonIds?: string[] | null;
    itemId: string;
    name?: string;
    unit?: string | null;
    isActive?: boolean;
    sortOrder?: number;
    actorUserId: string;
    actorType: "OWNER" | "ADMIN" | "SUPERVISOR";
  },
) {
  const item = await findItemInScope(prisma, input.organizationId, input.salonIds, input.itemId);

  const updated = await prisma.supplyItem.update({
    where: { id: item.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.unit !== undefined ? { unit: input.unit?.trim() || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    include: itemInclude,
  });

  await writeAuditLog({
    prisma,
    organizationId: input.organizationId,
    salonId: item.salonId,
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    action: "supply_item.updated",
    entityType: "SupplyItem",
    entityId: item.id,
    before: { name: item.name, isActive: item.isActive },
    after: { name: updated.name, isActive: updated.isActive },
  });

  return toItemRow(updated);
}

/**
 * بلاغ الحلاق.
 *
 * بلاغ مفتوح على الصنف نفسه لا يتكرّر: يُعاد كما هو إن كانت الشدّة نفسها أو
 * أقل، ويُرفع إن كان الجديد أشدّ (بُلِّغ «قارب» ثم نفد فعلًا) مع تسجيل من رفعه.
 */
export async function reportSupplyShortage(
  prisma: SupplyPrisma,
  input: {
    organizationId: string;
    salonId: string;
    barberId: string;
    itemId: string;
    status: Exclude<SupplyStatus, "AVAILABLE">;
    note?: string | null;
  },
) {
  const item = await prisma.supplyItem.findFirst({
    where: {
      id: input.itemId,
      organizationId: input.organizationId,
      salonId: input.salonId,
      isActive: true,
    },
  });
  if (!item) throw new BusinessError("الصنف غير متاح في فرعك", 404);

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const open = await tx.supplyReport.findFirst({
      where: { supplyItemId: item.id, state: "OPEN" },
    });

    if (open) {
      // نفس الشدّة أو أقل: البلاغ قائم، ولا داعي لإزعاج الإدارة مرة أخرى.
      if (SEVERITY[input.status] <= SEVERITY[open.status]) {
        return { report: await readReport(tx, open.id), escalated: false, alreadyOpen: true };
      }

      const escalated = await tx.supplyReport.update({
        where: { id: open.id },
        data: {
          status: input.status,
          escalatedByBarberId: input.barberId,
          escalatedAt: now,
          note: input.note?.trim() || open.note,
        },
      });
      await tx.supplyItem.update({
        where: { id: item.id },
        data: { status: input.status, lastReportedAt: now },
      });
      return { report: await readReport(tx, escalated.id), escalated: true, alreadyOpen: true };
    }

    const created = await tx.supplyReport.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        supplyItemId: item.id,
        barberId: input.barberId,
        status: input.status,
        note: input.note?.trim() || null,
      },
    });
    await tx.supplyItem.update({
      where: { id: item.id },
      data: { status: input.status, lastReportedAt: now },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        actorType: "BARBER",
        actorBarberId: input.barberId,
        action: "supply_report.created",
        entityType: "SupplyReport",
        entityId: created.id,
        after: { supplyItemId: item.id, status: input.status },
      },
    });

    return { report: await readReport(tx, created.id), escalated: false, alreadyOpen: false };
  });
}

/**
 * قرار الإدارة: «تم التوريد» يعيد الصنف متوفرًا ويقفل البلاغ، و«تجاهل» يقفله
 * بلا تغيير الحالة — الصنف يبقى ناقصًا حتى يورَّد فعلًا.
 */
export async function resolveSupplyReport(
  prisma: SupplyPrisma,
  input: {
    organizationId: string;
    salonIds?: string[] | null;
    reportId: string;
    decision: "RESTOCKED" | "DISMISS";
    note?: string | null;
    actorUserId: string;
    actorType: "OWNER" | "ADMIN" | "SUPERVISOR";
  },
) {
  const report = await prisma.supplyReport.findFirst({
    where: {
      id: input.reportId,
      organizationId: input.organizationId,
      ...(input.salonIds?.length ? { salonId: { in: input.salonIds } } : {}),
    },
  });
  if (!report) throw new BusinessError("البلاغ غير موجود", 404);
  if (report.state !== "OPEN") throw new BusinessError("تمّت معالجة هذا البلاغ مسبقًا", 409);

  const now = new Date();
  const restocked = input.decision === "RESTOCKED";

  await prisma.$transaction(async (tx) => {
    await tx.supplyReport.update({
      where: { id: report.id },
      data: {
        state: restocked ? "RESOLVED" : "DISMISSED",
        resolvedByUserId: input.actorUserId,
        resolvedAt: now,
        resolutionNote: input.note?.trim() || null,
      },
    });

    if (restocked) {
      await tx.supplyItem.update({
        where: { id: report.supplyItemId },
        data: { status: "AVAILABLE", lastRestockedAt: now },
      });
    }
  });

  await writeAuditLog({
    prisma,
    organizationId: input.organizationId,
    salonId: report.salonId,
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    action: restocked ? "supply_report.restocked" : "supply_report.dismissed",
    entityType: "SupplyReport",
    entityId: report.id,
    after: { decision: input.decision, supplyItemId: report.supplyItemId },
  });

  return readReport(prisma, report.id);
}

export async function listSupplyReports(
  prisma: SupplyPrisma,
  scope: { organizationId: string; salonIds?: string[] | null; state?: "OPEN" | "RESOLVED" | "DISMISSED" | null; take?: number },
) {
  const reports = await prisma.supplyReport.findMany({
    where: {
      organizationId: scope.organizationId,
      ...(scope.salonIds?.length ? { salonId: { in: scope.salonIds } } : {}),
      ...(scope.state ? { state: scope.state } : {}),
    },
    include: reportInclude,
    orderBy: [{ state: "asc" }, { createdAt: "desc" }],
    take: scope.take ?? 40,
  });
  return reports.map(toReportRow);
}

const reportInclude = {
  supplyItem: { select: { id: true, name: true, unit: true, status: true } },
  salon: { select: { id: true, name: true } },
  barber: { select: { id: true, name: true } },
  escalatedBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
} satisfies Prisma.SupplyReportInclude;

export type SupplyReportRow = ReturnType<typeof toReportRow>;

async function readReport(prisma: SupplyPrisma | Prisma.TransactionClient, id: string) {
  const report = await prisma.supplyReport.findUniqueOrThrow({ where: { id }, include: reportInclude });
  return toReportRow(report);
}

async function findItemInScope(
  prisma: SupplyPrisma,
  organizationId: string,
  salonIds: string[] | null | undefined,
  itemId: string,
) {
  const item = await prisma.supplyItem.findFirst({
    where: {
      id: itemId,
      organizationId,
      ...(salonIds?.length ? { salonId: { in: salonIds } } : {}),
    },
  });
  if (!item) throw new BusinessError("الصنف غير موجود", 404);
  return item;
}

function assertSalonInScope(salonId: string, salonIds: string[] | null | undefined) {
  if (salonIds?.length && !salonIds.includes(salonId)) {
    throw new BusinessError("هذا الفرع خارج نطاقك", 403);
  }
}

function toItemRow(item: Prisma.SupplyItemGetPayload<{ include: typeof itemInclude }>) {
  const openReport = item.reports[0] ?? null;
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    status: item.status,
    statusLabel: SUPPLY_STATUS_LABELS[item.status],
    isActive: item.isActive,
    sortOrder: item.sortOrder,
    salon: item.salon,
    lastReportedAt: item.lastReportedAt?.toISOString() ?? null,
    lastRestockedAt: item.lastRestockedAt?.toISOString() ?? null,
    openReport: openReport
      ? {
          id: openReport.id,
          status: openReport.status,
          statusLabel: SUPPLY_STATUS_LABELS[openReport.status],
          note: openReport.note,
          createdAt: openReport.createdAt.toISOString(),
          barberName: openReport.barber.name,
          escalatedByName: openReport.escalatedBy?.name ?? null,
        }
      : null,
  };
}

function toReportRow(report: Prisma.SupplyReportGetPayload<{ include: typeof reportInclude }>) {
  return {
    id: report.id,
    state: report.state,
    status: report.status,
    statusLabel: SUPPLY_STATUS_LABELS[report.status],
    note: report.note,
    createdAt: report.createdAt.toISOString(),
    escalatedAt: report.escalatedAt?.toISOString() ?? null,
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    resolutionNote: report.resolutionNote,
    supplyItem: report.supplyItem,
    salon: report.salon,
    barber: report.barber,
    escalatedBy: report.escalatedBy,
    resolvedBy: report.resolvedBy,
  };
}
