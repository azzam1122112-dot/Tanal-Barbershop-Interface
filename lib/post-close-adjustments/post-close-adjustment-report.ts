import type { AuditLog, PaymentMethod, PrismaClient } from "@prisma/client";
import { addRiyadhDays, normalizeRiyadhDay, startOfRiyadhDay } from "@/lib/datetime/riyadh";

type AdjustmentType = "VISIT_CANCELLED" | "VISIT_PAYMENT_METHOD_UPDATED" | "VISIT_AMOUNT_UPDATED";

type ReportFilters = {
  organizationId?: string | null;
  /** الفروع المسموح بها. `null`/غير محدد = كل فروع المؤسسة. */
  salonIds?: string[] | null;
  from?: Date | string | null;
  to?: Date | string | null;
  barberId?: string | null;
  adjustmentType?: AdjustmentType | null;
};

type AuditJson = Record<string, unknown>;
type SummaryAdjustment = {
  financialImpact: { cashDelta: number; cardDelta: number; netDelta: number };
  pointsImpact: { finalBalanceChange: number };
};

const actionToType: Record<string, AdjustmentType> = {
  "visit.cancelled": "VISIT_CANCELLED",
  "visit.payment_method_updated": "VISIT_PAYMENT_METHOD_UPDATED",
  "visit.amount_updated": "VISIT_AMOUNT_UPDATED",
};

export async function getPostCloseAdjustmentReport(prisma: PrismaClient, filters: ReportFilters = {}) {
  const range = normalizeRange(filters);
  const logs = await prisma.auditLog.findMany({
    where: {
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      entityType: "Visit",
      action: { in: Object.keys(actionToType) },
      createdAt: { gte: range.from, lt: range.to },
    },
    include: { actorUser: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const postCloseLogs = logs.filter((log) => {
    const after = asObject(log.after);
    return after.postCloseAdjustment === true && (!filters.adjustmentType || actionToType[log.action] === filters.adjustmentType);
  });
  const visitIds = [...new Set(postCloseLogs.map((log) => log.entityId).filter((id): id is string => Boolean(id)))];
  const visits = await prisma.visit.findMany({
    where: {
      id: { in: visitIds },
      ...(filters.salonIds && filters.salonIds.length > 0 ? { salonId: { in: filters.salonIds } } : {}),
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
    },
    include: { customer: true, barber: true },
  });
  const visitById = new Map(visits.map((visit) => [visit.id, visit]));
  const adjustments = postCloseLogs
    .map((log) => {
      const visit = log.entityId ? visitById.get(log.entityId) : null;
      if (!visit) return null;
      const type = actionToType[log.action];
      const before = asObject(log.before);
      const after = asObject(log.after);
      return {
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        type,
        visitId: visit.id,
        barberName: visit.barber.name,
        customerName: visit.customer?.name ?? "عميل زائر",
        customerPhone: visit.customer?.phone ?? "",
        visitDate: visit.visitedAt.toISOString(),
        reason: readString(after.reason) ?? readString(before.reason) ?? "",
        actorName: log.actorUser?.name ?? "مدير",
        postCloseAdjustment: true,
        oldValues: sanitizeValues(before),
        newValues: sanitizeValues(after),
        financialImpact: calculateFinancialImpact(type, before, after),
        pointsImpact: calculatePointsImpact(type, after),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  return {
    summary: summarizeAdjustments(adjustments),
    adjustments,
  };
}

function calculateFinancialImpact(type: AdjustmentType, before: AuditJson, after: AuditJson) {
  if (type === "VISIT_CANCELLED") {
    const netAmount = readNumber(before.netAmount);
    const paymentMethod = readPaymentMethod(before.paymentMethod);
    return {
      grossDelta: roundMoney(-readNumber(before.grossAmount)),
      discountDelta: roundMoney(-readNumber(before.discountAmount)),
      netDelta: roundMoney(-netAmount),
      cashDelta: roundMoney(paymentMethod === "CASH" ? -netAmount : 0),
      cardDelta: roundMoney(paymentMethod === "NETWORK" ? -netAmount : 0),
    };
  }

  if (type === "VISIT_PAYMENT_METHOD_UPDATED") {
    const netAmount = readNumber(before.netAmount ?? after.netAmount);
    const oldMethod = readPaymentMethod(before.paymentMethod);
    const newMethod = readPaymentMethod(after.paymentMethod);
    return {
      grossDelta: 0,
      discountDelta: 0,
      netDelta: 0,
      cashDelta: roundMoney((newMethod === "CASH" ? netAmount : 0) - (oldMethod === "CASH" ? netAmount : 0)),
      cardDelta: roundMoney((newMethod === "NETWORK" ? netAmount : 0) - (oldMethod === "NETWORK" ? netAmount : 0)),
    };
  }

  const netDelta = readNumber(after.netAmount) - readNumber(before.netAmount);
  const paymentMethod = readPaymentMethod(after.paymentMethod ?? before.paymentMethod);
  return {
    grossDelta: roundMoney(readNumber(after.grossAmount) - readNumber(before.grossAmount)),
    discountDelta: roundMoney(readNumber(after.discountAmount) - readNumber(before.discountAmount)),
    netDelta: roundMoney(netDelta),
    cashDelta: roundMoney(paymentMethod === "CASH" ? netDelta : 0),
    cardDelta: roundMoney(paymentMethod === "NETWORK" ? netDelta : 0),
  };
}

function calculatePointsImpact(type: AdjustmentType, after: AuditJson) {
  if (type === "VISIT_CANCELLED") {
    const earnedPointsDelta = -readNumber(after.pointsReversed);
    const redeemedPointsDelta = readNumber(after.redeemedPointsRestored);
    return {
      earnedPointsDelta,
      redeemedPointsDelta,
      finalBalanceChange: earnedPointsDelta + redeemedPointsDelta,
    };
  }

  if (type === "VISIT_AMOUNT_UPDATED") {
    const pointsAdjustment = readNumber(after.pointsAdjustment);
    return {
      earnedPointsDelta: pointsAdjustment,
      redeemedPointsDelta: 0,
      finalBalanceChange: pointsAdjustment,
    };
  }

  return {
    earnedPointsDelta: 0,
    redeemedPointsDelta: 0,
    finalBalanceChange: 0,
  };
}

function summarizeAdjustments(adjustments: SummaryAdjustment[]) {
  return adjustments.reduce(
    (summary, adjustment) => ({
      count: summary.count + 1,
      cashDelta: roundMoney(summary.cashDelta + adjustment.financialImpact.cashDelta),
      cardDelta: roundMoney(summary.cardDelta + adjustment.financialImpact.cardDelta),
      netDelta: roundMoney(summary.netDelta + adjustment.financialImpact.netDelta),
      pointsDelta: summary.pointsDelta + adjustment.pointsImpact.finalBalanceChange,
    }),
    { count: 0, cashDelta: 0, cardDelta: 0, netDelta: 0, pointsDelta: 0 },
  );
}

function normalizeRange(filters: ReportFilters) {
  const today = startOfRiyadhDay(new Date());
  const fallbackFrom = addRiyadhDays(today, -6);
  const fallbackTo = addRiyadhDays(today, 1);
  const from = filters.from ? normalizeRiyadhDay(filters.from) : fallbackFrom;
  const to = filters.to ? addRiyadhDays(normalizeRiyadhDay(filters.to), 1) : fallbackTo;
  return { from, to };
}

function sanitizeValues(values: AuditJson) {
  const allowed = [
    "grossAmount",
    "discountAmount",
    "netAmount",
    "paymentMethod",
    "pointsEarned",
    "pointsAdjustment",
    "pointsReversed",
    "redeemedPointsRestored",
    "oldStatus",
    "newStatus",
    "reason",
    "postCloseAdjustment",
  ];
  return Object.fromEntries(Object.entries(values).filter(([key]) => allowed.includes(key)));
}

function asObject(value: AuditLog["before"] | AuditLog["after"]): AuditJson {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AuditJson : {};
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readPaymentMethod(value: unknown): PaymentMethod | null {
  return value === "CASH" || value === "NETWORK" ? value : null;
}

function roundMoney(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}
