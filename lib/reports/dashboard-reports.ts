import type { PaymentMethod, Prisma, PrismaClient } from "@prisma/client";

type ReportPrisma = PrismaClient | Prisma.TransactionClient;

export type ReportFilters = {
  from?: Date | string | null;
  to?: Date | string | null;
  barberId?: string | null;
  paymentMethod?: PaymentMethod | "ALL" | null;
};

type VisitForReport = Prisma.VisitGetPayload<{
  include: {
    customer: { include: { loyaltyAccount: true } };
    barber: true;
    services: true;
    loyaltyTransactions: true;
    campaignRedemption: { include: { campaign: true } };
  };
}>;

export function getTodayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start, to: end };
}

export function getPresetRange(preset: string | null | undefined, now = new Date()) {
  const today = getTodayRange(now);
  if (preset === "yesterday") {
    const from = new Date(today.from);
    from.setDate(from.getDate() - 1);
    const to = new Date(today.from);
    return { from, to };
  }
  if (preset === "last7") {
    const from = new Date(today.from);
    from.setDate(from.getDate() - 6);
    return { from, to: today.to };
  }
  if (preset === "month") {
    const from = new Date(today.from.getFullYear(), today.from.getMonth(), 1);
    return { from, to: today.to };
  }
  return today;
}

export function normalizeReportFilters(filters: ReportFilters = {}) {
  const fallback = getTodayRange();
  const from = filters.from ? new Date(filters.from) : fallback.from;
  const to = filters.to ? new Date(filters.to) : fallback.to;

  return {
    from,
    to,
    barberId: filters.barberId || undefined,
    paymentMethod: filters.paymentMethod === "CASH" || filters.paymentMethod === "NETWORK" ? filters.paymentMethod : undefined,
  };
}

export async function getDashboardSummary(prisma: ReportPrisma, now = new Date()) {
  const range = getTodayRange(now);
  const normalized = normalizeReportFilters(range);
  const visits = await getVisitsForReport(prisma, normalized);
  const revenue = buildRevenueSummary(visits, range);
  const barberRows = buildBarberPerformance(visits, range);
  const services = buildServiceReport(visits);

  return {
    ...revenue,
    bestBarberToday: barberRows[0] ? { id: barberRows[0].barber.id, name: barberRows[0].barber.name, netAmount: barberRows[0].netAmount } : null,
    topServiceToday: services[0] ? { name: services[0].serviceName, usageCount: services[0].usageCount } : null,
  };
}

export async function getRevenueReport(prisma: ReportPrisma, filters: ReportFilters = {}) {
  const normalized = normalizeReportFilters(filters);
  const visits = await getVisitsForReport(prisma, normalized);
  return buildRevenueSummary(visits, normalized);
}

export async function getBarberPerformanceReport(prisma: ReportPrisma, filters: ReportFilters = {}) {
  const normalized = normalizeReportFilters(filters);
  const visits = await getVisitsForReport(prisma, normalized);
  return buildBarberPerformance(visits, normalized);
}

export async function getServiceReport(prisma: ReportPrisma, filters: ReportFilters = {}) {
  const normalized = normalizeReportFilters(filters);
  const visits = await getVisitsForReport(prisma, normalized);
  return buildServiceReport(visits);
}

export async function getCustomerReport(prisma: ReportPrisma, filters: ReportFilters = {}) {
  const normalized = normalizeReportFilters(filters);
  const visits = await getVisitsForReport(prisma, normalized);
  const topCustomers = buildTopCustomers(visits);
  const inactiveCustomers = await buildInactiveCustomers(prisma);
  return { topCustomers, inactiveCustomers };
}

export async function getDiscountReport(prisma: ReportPrisma, filters: ReportFilters = {}) {
  const normalized = normalizeReportFilters(filters);
  const visits = await getVisitsForReport(prisma, normalized);
  return buildDiscountSummary(visits);
}

async function getVisitsForReport(prisma: ReportPrisma, filters: ReturnType<typeof normalizeReportFilters>) {
  return prisma.visit.findMany({
    where: {
      status: "COMPLETED",
      visitedAt: { gte: filters.from, lt: filters.to },
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
      ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    },
    include: {
      customer: { include: { loyaltyAccount: true } },
      barber: true,
      services: true,
      loyaltyTransactions: true,
      campaignRedemption: { include: { campaign: true } },
    },
    orderBy: { visitedAt: "desc" },
  });
}

function buildRevenueSummary(visits: VisitForReport[], range: { from: Date; to: Date }) {
  const grossAmount = sum(visits.map((visit) => Number(visit.grossAmount)));
  const discountAmount = sum(visits.map((visit) => Number(visit.discountAmount)));
  const netAmount = sum(visits.map((visit) => Number(visit.netAmount)));
  const cashAmount = sum(visits.filter((visit) => visit.paymentMethod === "CASH").map((visit) => Number(visit.netAmount)));
  const networkAmount = sum(visits.filter((visit) => visit.paymentMethod === "NETWORK").map((visit) => Number(visit.netAmount)));
  const pointsEarned = sum(visits.flatMap((visit) => visit.loyaltyTransactions.filter((transaction) => transaction.type === "EARN").map((transaction) => transaction.points)));
  const pointsRedeemed = Math.abs(
    sum(visits.flatMap((visit) => visit.loyaltyTransactions.filter((transaction) => transaction.type === "REDEEM").map((transaction) => transaction.points))),
  );
  const customers = new Map<string, { firstVisitAt: Date | null }>();
  for (const visit of visits) {
    const current = customers.get(visit.customerId);
    if (!current || visit.visitedAt < (current.firstVisitAt ?? visit.visitedAt)) {
      customers.set(visit.customerId, { firstVisitAt: visit.visitedAt });
    }
  }
  const newCustomerIds = new Set(visits.filter((visit) => visit.customer.visitCount <= 1 || visit.customer.createdAt >= range.from).map((visit) => visit.customerId));

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    grossAmount,
    discountAmount,
    netAmount,
    cashAmount,
    networkAmount,
    visitsCount: visits.length,
    averageTicket: visits.length ? roundMoney(netAmount / visits.length) : 0,
    newCustomersCount: newCustomerIds.size,
    returningCustomersCount: Math.max(0, customers.size - newCustomerIds.size),
    pointsEarned,
    pointsRedeemed,
    rewardRedemptionsCount: visits.filter((visit) => visit.discountType === "REWARD").length,
    campaignRedemptionsCount: visits.filter((visit) => visit.discountType === "CAMPAIGN").length,
  };
}

function buildBarberPerformance(visits: VisitForReport[], range: { from: Date; to: Date }) {
  const byBarber = new Map<string, VisitForReport[]>();
  for (const visit of visits) {
    byBarber.set(visit.barberId, [...(byBarber.get(visit.barberId) ?? []), visit]);
  }

  return [...byBarber.entries()]
    .map(([, barberVisits]) => {
      const revenue = buildRevenueSummary(barberVisits, range);
      const firstVisit = barberVisits[0];
      return {
        barber: {
          id: firstVisit.barber.id,
          name: firstVisit.barber.name,
        },
        ...revenue,
      };
    })
    .sort((a, b) => b.netAmount - a.netAmount || b.visitsCount - a.visitsCount);
}

function buildServiceReport(visits: VisitForReport[]) {
  const rows = new Map<string, { serviceId: string; serviceName: string; usageCount: number; visits: Set<string>; linkedSales: number }>();
  for (const visit of visits) {
    for (const service of visit.services) {
      const row = rows.get(service.serviceId) ?? {
        serviceId: service.serviceId,
        serviceName: service.serviceName,
        usageCount: 0,
        visits: new Set<string>(),
        linkedSales: 0,
      };
      row.usageCount += service.quantity;
      row.visits.add(visit.id);
      row.linkedSales += Number(service.lineTotal);
      rows.set(service.serviceId, row);
    }
  }

  return [...rows.values()]
    .map((row) => ({
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      usageCount: row.usageCount,
      visitsCount: row.visits.size,
      linkedSales: roundMoney(row.linkedSales),
    }))
    .sort((a, b) => b.usageCount - a.usageCount || b.visitsCount - a.visitsCount || a.serviceName.localeCompare(b.serviceName));
}

function buildTopCustomers(visits: VisitForReport[]) {
  const byCustomer = new Map<string, { customer: VisitForReport["customer"]; visits: VisitForReport[] }>();
  for (const visit of visits) {
    byCustomer.set(visit.customerId, {
      customer: visit.customer,
      visits: [...(byCustomer.get(visit.customerId)?.visits ?? []), visit],
    });
  }

  return [...byCustomer.values()]
    .map(({ customer, visits: customerVisits }) => ({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
      },
      visitsCount: customerVisits.length,
      netAmount: sum(customerVisits.map((visit) => Number(visit.netAmount))),
      lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
      pointsBalance: customer.loyaltyAccount?.points ?? 0,
    }))
    .sort((a, b) => b.netAmount - a.netAmount || b.visitsCount - a.visitsCount)
    .slice(0, 20);
}

async function buildInactiveCustomers(prisma: ReportPrisma) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 30);
  const customers = await prisma.customer.findMany({
    where: {
      visitCount: { gt: 0 },
      lastVisitAt: { lt: cutoff },
    },
    include: { loyaltyAccount: true },
    orderBy: { lastVisitAt: "asc" },
    take: 50,
  });

  const now = Date.now();
  return customers.map((customer) => ({
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
    },
    lastVisitAt: customer.lastVisitAt?.toISOString() ?? null,
    daysSinceLastVisit: customer.lastVisitAt ? Math.floor((now - customer.lastVisitAt.getTime()) / (24 * 60 * 60 * 1000)) : null,
    pointsBalance: customer.loyaltyAccount?.points ?? 0,
  }));
}

function buildDiscountSummary(visits: VisitForReport[]) {
  const rewardVisits = visits.filter((visit) => visit.discountType === "REWARD");
  const campaignVisits = visits.filter((visit) => visit.discountType === "CAMPAIGN");
  const campaignUsage = new Map<string, { campaignId: string; name: string; uses: number; discountAmount: number }>();
  for (const visit of campaignVisits) {
    const campaignId = visit.discountSourceId ?? visit.campaignRedemption?.campaignId ?? "unknown";
    const current = campaignUsage.get(campaignId) ?? {
      campaignId,
      name: visit.campaignRedemption?.campaign.name ?? "حملة",
      uses: 0,
      discountAmount: 0,
    };
    current.uses += 1;
    current.discountAmount += Number(visit.discountAmount);
    campaignUsage.set(campaignId, current);
  }
  const topCampaign = [...campaignUsage.values()].sort((a, b) => b.uses - a.uses || b.discountAmount - a.discountAmount)[0] ?? null;

  return {
    rewardDiscountAmount: sum(rewardVisits.map((visit) => Number(visit.discountAmount))),
    campaignDiscountAmount: sum(campaignVisits.map((visit) => Number(visit.discountAmount))),
    rewardRedemptionsCount: rewardVisits.length,
    campaignRedemptionsCount: campaignVisits.length,
    topCampaign: topCampaign
      ? {
          ...topCampaign,
          discountAmount: roundMoney(topCampaign.discountAmount),
        }
      : null,
  };
}

function sum(values: number[]) {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
