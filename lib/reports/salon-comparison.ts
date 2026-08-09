import type { Prisma, PrismaClient } from "@prisma/client";
import { roundMoney } from "@/lib/visits/visit-totals";

type ReportPrisma = PrismaClient | Prisma.TransactionClient;

/**
 * مقارنة الفروع جنبًا إلى جنب لمالك بعدة فروع.
 * المجموع وحده لا يجيب سؤال المالك الحقيقي: أي فرع يتفوّق وأيها يتراجع.
 */
export async function getSalonComparisonReport(
  prisma: ReportPrisma,
  filters: { organizationId: string; salonIds?: string[] | null; from?: Date | string | null; to?: Date | string | null },
) {
  const from = filters.from ? startOfDay(filters.from) : startOfMonth();
  const to = filters.to ? endExclusive(filters.to) : endExclusive(new Date());
  const periodDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));

  const salons = await prisma.salon.findMany({
    where: {
      organizationId: filters.organizationId,
      ...(filters.salonIds && filters.salonIds.length > 0 ? { id: { in: filters.salonIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, isActive: true },
  });

  const visits = await prisma.visit.findMany({
    where: {
      organizationId: filters.organizationId,
      status: "COMPLETED",
      visitedAt: { gte: from, lt: to },
      ...(filters.salonIds && filters.salonIds.length > 0 ? { salonId: { in: filters.salonIds } } : {}),
    },
    select: {
      salonId: true,
      barberId: true,
      customerId: true,
      netAmount: true,
      discountAmount: true,
      vatAmount: true,
      commissionAmount: true,
      paymentMethod: true,
    },
  });

  const expenses = await prisma.cashExpense.groupBy({
    by: ["salonId"],
    where: {
      organizationId: filters.organizationId,
      createdAt: { gte: from, lt: to },
      ...(filters.salonIds && filters.salonIds.length > 0 ? { salonId: { in: filters.salonIds } } : {}),
    },
    _sum: { amount: true },
  });
  const expensesBySalon = new Map(expenses.map((row) => [row.salonId, Number(row._sum.amount ?? 0)]));

  const rows = salons.map((salon) => {
    const salonVisits = visits.filter((visit) => visit.salonId === salon.id);
    const netAmount = roundMoney(salonVisits.reduce((total, visit) => total + Number(visit.netAmount), 0));
    const commissionAmount = roundMoney(salonVisits.reduce((total, visit) => total + Number(visit.commissionAmount), 0));
    const expensesTotal = roundMoney(expensesBySalon.get(salon.id) ?? 0);

    return {
      salonId: salon.id,
      salonName: salon.name,
      isActive: salon.isActive,
      visitsCount: salonVisits.length,
      netAmount,
      cashAmount: roundMoney(
        salonVisits.filter((visit) => visit.paymentMethod === "CASH").reduce((total, visit) => total + Number(visit.netAmount), 0),
      ),
      cardAmount: roundMoney(
        salonVisits.filter((visit) => visit.paymentMethod === "NETWORK").reduce((total, visit) => total + Number(visit.netAmount), 0),
      ),
      discountAmount: roundMoney(salonVisits.reduce((total, visit) => total + Number(visit.discountAmount), 0)),
      vatAmount: roundMoney(salonVisits.reduce((total, visit) => total + Number(visit.vatAmount), 0)),
      commissionAmount,
      expensesTotal,
      // ما يتبقى للمؤسسة بعد عمولات الحلاقين والمصروفات النثرية.
      contribution: roundMoney(netAmount - commissionAmount - expensesTotal),
      averageTicket: salonVisits.length > 0 ? roundMoney(netAmount / salonVisits.length) : 0,
      dailyAverage: roundMoney(netAmount / periodDays),
      activeBarbers: new Set(salonVisits.map((visit) => visit.barberId)).size,
      uniqueCustomers: new Set(salonVisits.map((visit) => visit.customerId)).size,
    };
  });

  const totalNet = roundMoney(rows.reduce((total, row) => total + row.netAmount, 0));
  const ranked = [...rows]
    .sort((a, b) => b.netAmount - a.netAmount)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      share: totalNet > 0 ? roundMoney((row.netAmount / totalNet) * 100) : 0,
    }));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    periodDays,
    rows: ranked,
    totals: {
      salonsCount: rows.length,
      visitsCount: rows.reduce((total, row) => total + row.visitsCount, 0),
      netAmount: totalNet,
      commissionAmount: roundMoney(rows.reduce((total, row) => total + row.commissionAmount, 0)),
      expensesTotal: roundMoney(rows.reduce((total, row) => total + row.expensesTotal, 0)),
      contribution: roundMoney(rows.reduce((total, row) => total + row.contribution, 0)),
    },
    best: ranked[0] ?? null,
    weakest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
  };
}

function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfDay(date: Date | string) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endExclusive(date: Date | string) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}
