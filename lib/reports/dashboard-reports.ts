import type { PaymentMethod, Prisma, PrismaClient } from "@prisma/client";
import { getCachedJson, redisKey, setCachedJson } from "@/lib/cache/redis";
import { addRiyadhDays, getRiyadhDayRange, normalizeRiyadhDay, startOfRiyadhMonth, toRiyadhDateKey } from "@/lib/datetime/riyadh";

type ReportPrisma = PrismaClient | Prisma.TransactionClient;

export type ReportFilters = {
  organizationId?: string | null;
  /** الفروع المسموح بها. `null`/غير محدد = كل فروع المؤسسة. مصفوفة = قصر على هذه الفروع. */
  salonIds?: string[] | null;
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
    productLines: true;
    loyaltyTransactions: true;
    campaignRedemption: { include: { campaign: true } };
  };
}>;

export function getTodayRange(now = new Date()) {
  const { from, to } = getRiyadhDayRange(now);
  return { from, to };
}

export function getPresetRange(preset: string | null | undefined, now = new Date()) {
  const today = getTodayRange(now);
  if (preset === "yesterday") {
    return { from: addRiyadhDays(today.from, -1), to: today.from };
  }
  if (preset === "last7") {
    return { from: addRiyadhDays(today.from, -6), to: today.to };
  }
  if (preset === "month") {
    return { from: startOfRiyadhMonth(now), to: today.to };
  }
  return today;
}

export function normalizeReportFilters(filters: ReportFilters = {}) {
  const fallback = getTodayRange();
  const from = filters.from ? normalizeReportBoundary(filters.from, false) : fallback.from;
  const to = filters.to ? normalizeReportBoundary(filters.to, true) : fallback.to;

  return {
    organizationId: filters.organizationId || undefined,
    salonIds: filters.salonIds && filters.salonIds.length > 0 ? filters.salonIds : undefined,
    from,
    to,
    barberId: filters.barberId || undefined,
    paymentMethod: filters.paymentMethod === "CASH" || filters.paymentMethod === "NETWORK" ? filters.paymentMethod : undefined,
  };
}

export async function getDashboardSummary(prisma: ReportPrisma, organizationId?: string, salonIds?: string[] | null, now = new Date()) {
  const range = getTodayRange(now);
  const cacheKey = organizationId
    ? redisKey("dashboard", "summary", organizationId, scopeCachePart(salonIds), toRiyadhDateKey(range.from))
    : null;
  if (cacheKey) {
    const cached = await getCachedJson<Awaited<ReturnType<typeof buildDashboardSummary>>>(cacheKey);
    if (cached) return cached;
  }
  const normalized = normalizeReportFilters({ ...range, organizationId, salonIds });
  const visits = await getVisitsForReport(prisma, normalized);
  const summary = buildDashboardSummary(visits, range);
  if (cacheKey) await setCachedJson(cacheKey, summary, dashboardCacheTtl());
  return summary;
}

function normalizeReportBoundary(value: Date | string, isEnd: boolean) {
  if (value instanceof Date) return value;
  const day = normalizeRiyadhDay(value);
  return isEnd ? addRiyadhDays(day, 1) : day;
}

function buildDashboardSummary(visits: VisitForReport[], range: { from: Date; to: Date }) {
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
  const inactiveCustomers = await buildInactiveCustomers(prisma, normalized.organizationId);
  return { topCustomers, inactiveCustomers };
}

export async function getDiscountReport(prisma: ReportPrisma, filters: ReportFilters = {}) {
  const normalized = normalizeReportFilters(filters);
  const visits = await getVisitsForReport(prisma, normalized);
  return buildDiscountSummary(visits);
}

/**
 * تقرير الصفحة الكامل من لقطة بيانات واحدة. سابقًا كانت الصفحة تستدعي خمس
 * دوال، وكل واحدة تجلب الزيارات وعلاقاتها نفسها من PostgreSQL؛ أي خمسة أضعاف
 * القراءة والذاكرة بلا فائدة.
 */
export async function getDashboardReportsBundle(prisma: ReportPrisma, filters: ReportFilters = {}) {
  const normalized = normalizeReportFilters(filters);
  const [visits, inactiveCustomers] = await Promise.all([
    getVisitsForReport(prisma, normalized),
    buildInactiveCustomers(prisma, normalized.organizationId),
  ]);

  return {
    revenue: buildRevenueSummary(visits, normalized),
    barberPerformance: buildBarberPerformance(visits, normalized),
    services: buildServiceReport(visits),
    customers: { topCustomers: buildTopCustomers(visits), inactiveCustomers },
    discounts: buildDiscountSummary(visits),
  };
}

async function getVisitsForReport(prisma: ReportPrisma, filters: ReturnType<typeof normalizeReportFilters>) {
  return prisma.visit.findMany({
    where: {
      status: "COMPLETED",
      visitedAt: { gte: filters.from, lt: filters.to },
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      ...(filters.salonIds ? { salonId: { in: filters.salonIds } } : {}),
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
      ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    },
    include: {
      customer: { include: { loyaltyAccount: true } },
      barber: true,
      services: true,
      productLines: true,
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
  const commissionAmount = sum(visits.map((visit) => Number(visit.commissionAmount)));
  // تكلفة ما بيع من مخزون، من لقطة السطر لا من كتالوج اليوم.
  const productCost = sumProductCost(visits);
  const cashAmount = sum(visits.filter((visit) => visit.paymentMethod === "CASH").map((visit) => Number(visit.netAmount)));
  const networkAmount = sum(visits.filter((visit) => visit.paymentMethod === "NETWORK").map((visit) => Number(visit.netAmount)));
  const pointsEarned = sum(visits.flatMap((visit) => visit.loyaltyTransactions.filter((transaction) => transaction.type === "EARN").map((transaction) => transaction.points)));
  const pointsRedeemed = Math.abs(
    sum(visits.flatMap((visit) => visit.loyaltyTransactions.filter((transaction) => transaction.type === "REDEEM").map((transaction) => transaction.points))),
  );
  const customers = new Map<string, { firstVisitAt: Date | null }>();
  for (const visit of visits) {
    if (!visit.customerId || !visit.customer) continue;
    const current = customers.get(visit.customerId);
    if (!current || visit.visitedAt < (current.firstVisitAt ?? visit.visitedAt)) {
      customers.set(visit.customerId, { firstVisitAt: visit.visitedAt });
    }
  }
  const newCustomerIds = new Set(visits.flatMap((visit) => visit.customerId && visit.customer && (visit.customer.visitCount <= 1 || visit.customer.createdAt >= range.from) ? [visit.customerId] : []));

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    grossAmount,
    discountAmount,
    netAmount,
    commissionAmount,
    productCost,
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
    if (!visit.customerId || !visit.customer) continue;
    byCustomer.set(visit.customerId, {
      customer: visit.customer,
      visits: [...(byCustomer.get(visit.customerId)?.visits ?? []), visit],
    });
  }

  return [...byCustomer.values()]
    .filter((row): row is { customer: NonNullable<VisitForReport["customer"]>; visits: VisitForReport[] } => Boolean(row.customer))
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

async function buildInactiveCustomers(prisma: ReportPrisma, organizationId?: string) {
  const cutoff = addRiyadhDays(normalizeRiyadhDay(new Date()), -30);
  const customers = await prisma.customer.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
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

/** سطر بلا تكلفة مسجّلة يُحتسب صفرًا — تقدير متحفّظ لا تخمين بسعر اليوم. */
function sumProductCost(visits: VisitForReport[]) {
  return sum(
    visits.flatMap((visit) =>
      visit.productLines.map((line) => (line.unitCost == null ? 0 : Number(line.unitCost) * line.quantity)),
    ),
  );
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function scopeCachePart(salonIds?: string[] | null) {
  return salonIds && salonIds.length > 0 ? [...salonIds].sort().join(",") : "all";
}

function dashboardCacheTtl() {
  const configured = Number(process.env.DASHBOARD_CACHE_TTL_SECONDS);
  return Number.isFinite(configured) ? Math.min(60, Math.max(2, Math.trunc(configured))) : 10;
}
