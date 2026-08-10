import type { Prisma, PrismaClient } from "@prisma/client";
import { roundMoney } from "@/lib/visits/visit-totals";

type MonthlyCommissionPrisma = PrismaClient | Prisma.TransactionClient;

/**
 * يعيد مستحق الحلاق للشهر الميلادي الحالي فقط عندما تكون العمولة مفعّلة لديه.
 * المبلغ مجموع القيم التاريخية المخزنة وقت إتمام الزيارة، وليس إعادة حساب بالنسب الحالية.
 */
export async function getBarberMonthlyCommission(
  prisma: MonthlyCommissionPrisma,
  barberId: string,
  date = new Date(),
) {
  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
    select: { commissionEnabled: true, commissionRate: true },
  });

  if (!barber?.commissionEnabled) return null;

  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const result = await prisma.visit.aggregate({
    where: {
      barberId,
      status: "COMPLETED",
      visitedAt: { gte: from, lt: to },
    },
    _count: { _all: true },
    _sum: { subtotalAmount: true, commissionAmount: true },
  });

  const commissionBase = roundMoney(Number(result._sum.subtotalAmount ?? 0));
  const commissionAmount = roundMoney(Number(result._sum.commissionAmount ?? 0));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    monthLabel: new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
      month: "long",
      year: "numeric",
    }).format(date),
    visitsCount: result._count._all,
    commissionBase,
    commissionAmount,
    effectiveRate: commissionBase > 0 ? roundMoney((commissionAmount / commissionBase) * 100) : 0,
    configuredRate: barber.commissionRate == null ? null : Number(barber.commissionRate),
  };
}
