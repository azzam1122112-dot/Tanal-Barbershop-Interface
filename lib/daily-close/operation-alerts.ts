import type { PrismaClient } from "@prisma/client";
import { getCashSessionSummary } from "@/lib/cash-sessions/cash-session-service";
import { getTodayRange } from "@/lib/reports/dashboard-reports";

export async function getOperationAlerts(prisma: PrismaClient, date: Date | string = new Date()) {
  const summary = await getCashSessionSummary(prisma);
  const { from, to } = getTodayRange(new Date(date));
  const zeroNetVisits = await prisma.visit.count({
    where: {
      status: "COMPLETED",
      visitedAt: { gte: from, lt: to },
      netAmount: 0,
    },
  });
  const alerts = [];

  const openCashRows = summary.filter((row) => row.openSession && row.openSession.cashTotal > 0);
  for (const row of openCashRows) {
    alerts.push({
      type: "UNCLOSED_CASH",
      severity: "warning",
      barberId: row.barberId,
      barberName: row.barberName,
      message: `الحلاق ${row.barberName} لديه كاش في جلسة صندوق مفتوحة`,
      amount: row.openSession?.cashTotal ?? 0,
    });
  }

  for (const row of summary) {
    const totals = row.openSession;
    const discountRatio = totals && totals.grossTotal > 0 ? totals.discountTotal / totals.grossTotal : 0;
    if (discountRatio > 0.25) {
      alerts.push({
        type: "HIGH_DISCOUNT_RATIO",
        severity: "warning",
        barberId: row.barberId,
        barberName: row.barberName,
        message: `خصومات ${row.barberName} في الجلسة الحالية مرتفعة`,
        amount: totals?.discountTotal ?? 0,
        ratio: Math.round(discountRatio * 10000) / 100,
      });
    }
  }

  for (const row of summary.filter((item) => item.openSession && item.openSession.cashTotal >= 500)) {
    alerts.push({
      type: "HIGH_UNCLOSED_CASH",
      severity: "warning",
      barberId: row.barberId,
      barberName: row.barberName,
      message: `كاش مرتفع في جلسة صندوق مفتوحة لدى ${row.barberName}`,
      amount: row.openSession?.cashTotal ?? 0,
    });
  }

  for (const row of summary.filter((item) => item.openSession && hoursSince(item.openSession.openedAt) >= 12)) {
    alerts.push({
      type: "LONG_OPEN_CASH_SESSION",
      severity: "info",
      barberId: row.barberId,
      barberName: row.barberName,
      message: `جلسة صندوق ${row.barberName} مفتوحة منذ وقت طويل`,
      hoursOpen: hoursSince(row.openSession!.openedAt),
    });
  }

  if (zeroNetVisits > 0) {
    alerts.push({
      type: "ZERO_NET_VISITS",
      severity: "info",
      message: "توجد زيارات بصافي صفر",
      count: zeroNetVisits,
    });
  }

  return {
    date: new Date(date).toISOString(),
    openCashBarbersCount: openCashRows.length,
    unclosedCashTotal: openCashRows.reduce((total, row) => total + (row.openSession?.cashTotal ?? 0), 0),
    closesTodayCount: await prisma.cashSession.count({ where: { status: "CLOSED", closedAt: { gte: from, lt: to } } }),
    alerts,
  };
}

function hoursSince(value: string) {
  return Math.floor((Date.now() - new Date(value).getTime()) / (60 * 60 * 1000));
}
