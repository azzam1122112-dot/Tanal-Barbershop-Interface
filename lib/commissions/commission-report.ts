import type { Prisma, PrismaClient } from "@prisma/client";
import { roundMoney } from "@/lib/visits/visit-totals";

type ReportPrisma = PrismaClient | Prisma.TransactionClient;

export type CommissionReportFilters = {
  organizationId?: string | null;
  salonIds?: string[] | null;
  from?: Date | string | null;
  to?: Date | string | null;
  barberId?: string | null;
};

/**
 * مستحقات عمولات الحلاقين عن فترة.
 * تعتمد على `commissionAmount` المخزّن وقت الزيارة، فلا تتغيّر الأرقام التاريخية
 * عند تعديل النسب لاحقًا، وتستثني الزيارات الملغاة تلقائيًا.
 */
export async function getCommissionReport(prisma: ReportPrisma, filters: CommissionReportFilters = {}) {
  const from = filters.from ? new Date(filters.from) : startOfMonth();
  const to = filters.to ? endExclusive(filters.to) : endExclusive(new Date());

  const visits = await prisma.visit.findMany({
    where: {
      status: "COMPLETED",
      visitedAt: { gte: from, lt: to },
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      ...(filters.salonIds && filters.salonIds.length > 0 ? { salonId: { in: filters.salonIds } } : {}),
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
    },
    include: { barber: true, services: true, salon: { select: { id: true, name: true } } },
    orderBy: { visitedAt: "desc" },
  });

  const byBarber = new Map<
    string,
    {
      barberId: string;
      barberName: string;
      salonName: string;
      visitsCount: number;
      commissionBase: number;
      commissionAmount: number;
      netAmount: number;
      rates: Set<number>;
    }
  >();

  for (const visit of visits) {
    const key = visit.barberId;
    const row = byBarber.get(key) ?? {
      barberId: key,
      barberName: visit.barber.name,
      salonName: visit.salon?.name ?? "",
      visitsCount: 0,
      commissionBase: 0,
      commissionAmount: 0,
      netAmount: 0,
      rates: new Set<number>(),
    };

    row.visitsCount += 1;
    row.commissionBase += Number(visit.netAmount);
    row.commissionAmount += Number(visit.commissionAmount);
    row.netAmount += Number(visit.netAmount);
    for (const line of visit.services) {
      const rate = Number(line.commissionRate);
      if (rate > 0) row.rates.add(rate);
    }

    byBarber.set(key, row);
  }

  const rows = [...byBarber.values()]
    .map((row) => ({
      barberId: row.barberId,
      barberName: row.barberName,
      salonName: row.salonName,
      visitsCount: row.visitsCount,
      commissionBase: roundMoney(row.commissionBase),
      commissionAmount: roundMoney(row.commissionAmount),
      netAmount: roundMoney(row.netAmount),
      // نسبة فعلية محسوبة لا مفترضة — تكشف اختلاف النسب بين الخدمات.
      effectiveRate: row.commissionBase > 0 ? roundMoney((row.commissionAmount / row.commissionBase) * 100) : 0,
      appliedRates: [...row.rates].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.commissionAmount - a.commissionAmount);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    rows,
    totals: {
      barbersCount: rows.length,
      visitsCount: rows.reduce((total, row) => total + row.visitsCount, 0),
      commissionBase: roundMoney(rows.reduce((total, row) => total + row.commissionBase, 0)),
      commissionAmount: roundMoney(rows.reduce((total, row) => total + row.commissionAmount, 0)),
      netAmount: roundMoney(rows.reduce((total, row) => total + row.netAmount, 0)),
    },
  };
}

function startOfMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function endExclusive(date: Date | string) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  return next;
}
