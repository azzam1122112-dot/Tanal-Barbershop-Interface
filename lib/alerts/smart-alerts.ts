import type { PrismaClient } from "@prisma/client";
import { roundMoney } from "@/lib/visits/visit-totals";
import { countAr, formatMoney } from "@/lib/format";
import { getLowStockProducts } from "@/lib/products/product-service";
import { getCachedJson, redisKey, setCachedJson } from "@/lib/cache/redis";

export type SmartAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  /** رابط الإجراء المقابل — التنبيه بلا إجراء ضجيج. */
  href?: string;
};

// صيغ الجمع العربية: 1 مفرد، 2 مثنى، 3-10 جمع، 11+ مفرد منصوب.
const CUSTOMER_FORMS = { one: "عميل واحد", two: "عميلان", few: "عملاء", many: "عميلًا" };
const PRODUCT_FORMS = { one: "منتج واحد", two: "منتجان", few: "منتجات", many: "منتجًا" };
const SESSION_FORMS = { one: "جلسة واحدة", two: "جلستان", few: "جلسات", many: "جلسة" };

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVE_DAYS = 45;
/** انخفاض يتجاوز هذه النسبة يستحق التنبيه. */
const DROP_THRESHOLD = 0.3;

/**
 * تنبيهات تحليلية تُقرأ من البيانات المتراكمة — تكمّل التنبيهات التشغيلية اللحظية
 * في `operation-alerts.ts` (كاش مفتوح، خصومات مرتفعة).
 * كل تنبيه له إجراء واضح، وإلا فهو ضجيج يُدرَّب المدير على تجاهله.
 */
export async function getSmartAlerts(
  prisma: PrismaClient,
  scope: { organizationId: string; salonIds?: string[] | null },
  now = new Date(),
): Promise<SmartAlert[]> {
  const scopeKey = scope.salonIds && scope.salonIds.length > 0 ? [...scope.salonIds].sort().join(",") : "all";
  const cacheKey = redisKey("dashboard", "smart-alerts", scope.organizationId, scopeKey);
  const cached = await getCachedJson<SmartAlert[]>(cacheKey);
  if (cached) return cached;

  const salonFilter = scope.salonIds && scope.salonIds.length > 0 ? { salonId: { in: scope.salonIds } } : {};
  const alerts: SmartAlert[] = [];

  const [lowStock, inactiveCustomers, rewardReady, barberTrend, cashGaps] = await Promise.all([
    getLowStockProducts(prisma, scope),
    countInactiveCustomers(prisma, scope.organizationId, now),
    countRewardReadyCustomers(prisma, scope.organizationId),
    getBarberTrend(prisma, scope.organizationId, salonFilter, now),
    getRepeatedCashGaps(prisma, scope.organizationId, salonFilter, now),
  ]);

  const outOfStock = lowStock.filter((product) => product.isOutOfStock);
  if (outOfStock.length > 0) {
    alerts.push({
      id: "out-of-stock",
      severity: "critical",
      title: `${countAr(outOfStock.length, PRODUCT_FORMS)} نفد من المخزون`,
      detail: outOfStock.slice(0, 3).map((product) => `${product.name} (${product.salonName})`).join("، "),
      href: "/dashboard/products",
    });
  }

  const lowOnly = lowStock.filter((product) => !product.isOutOfStock);
  if (lowOnly.length > 0) {
    alerts.push({
      id: "low-stock",
      severity: "warning",
      title: `${countAr(lowOnly.length, PRODUCT_FORMS)} قارب على النفاد`,
      detail: lowOnly.slice(0, 3).map((product) => `${product.name}: ${product.stockQuantity} متبقٍ`).join("، "),
      href: "/dashboard/products",
    });
  }

  for (const barber of barberTrend) {
    alerts.push({
      id: `barber-drop-${barber.barberId}`,
      severity: "warning",
      title: `أداء ${barber.barberName} منخفض هذا الأسبوع`,
      detail: `${formatMoney(barber.currentNet)} مقابل ${formatMoney(barber.previousNet)} الأسبوع الماضي (انخفاض ${barber.dropPercent}%)`,
      href: "/dashboard/reports",
    });
  }

  for (const gap of cashGaps) {
    alerts.push({
      id: `cash-gap-${gap.barberId}`,
      severity: "critical",
      title: `فروقات صندوق متكررة لدى ${gap.barberName}`,
      detail: `${countAr(gap.count, SESSION_FORMS)} بفرق خلال آخر 30 يومًا، بإجمالي ${formatMoney(gap.totalDifference)}`,
      href: "/dashboard/daily-close",
    });
  }

  if (inactiveCustomers > 0) {
    alerts.push({
      id: "inactive-customers",
      severity: "info",
      title: `${countAr(inactiveCustomers, CUSTOMER_FORMS)} لم يزوروا منذ ${INACTIVE_DAYS} يومًا`,
      detail: "جهّز لهم رسالة استرجاع من صفحة واتساب.",
      href: "/dashboard/whatsapp",
    });
  }

  if (rewardReady > 0) {
    alerts.push({
      id: "reward-ready",
      severity: "info",
      title: `${countAr(rewardReady, CUSTOMER_FORMS)} يستحقون مكافأة`,
      detail: "ذكّرهم برصيدهم ليعودوا لاستبدالها.",
      href: "/dashboard/whatsapp",
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  const sorted = alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  await setCachedJson(cacheKey, sorted, dashboardCacheTtl());
  return sorted;
}

async function countInactiveCustomers(prisma: PrismaClient, organizationId: string, now: Date) {
  return prisma.customer.count({
    where: {
      organizationId,
      whatsappOptIn: true,
      visitCount: { gt: 0 },
      lastVisitAt: { lt: new Date(now.getTime() - INACTIVE_DAYS * DAY_MS) },
    },
  });
}

async function countRewardReadyCustomers(prisma: PrismaClient, organizationId: string) {
  const lowestRule = await prisma.rewardRule.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { requiredPoints: "asc" },
    select: { requiredPoints: true },
  });
  if (!lowestRule) return 0;
  return prisma.loyaltyAccount.count({
    where: { organizationId, points: { gte: lowestRule.requiredPoints } },
  });
}

/** يقارن دخل كل حلاق في آخر 7 أيام بالسبعة التي قبلها. */
async function getBarberTrend(
  prisma: PrismaClient,
  organizationId: string,
  salonFilter: { salonId?: { in: string[] } },
  now: Date,
) {
  const currentFrom = new Date(now.getTime() - 7 * DAY_MS);
  const previousFrom = new Date(now.getTime() - 14 * DAY_MS);

  const [current, previous] = await Promise.all([
    prisma.visit.groupBy({
      by: ["barberId"],
      where: { organizationId, ...salonFilter, status: "COMPLETED", visitedAt: { gte: currentFrom, lt: now } },
      _sum: { netAmount: true },
    }),
    prisma.visit.groupBy({
      by: ["barberId"],
      where: { organizationId, ...salonFilter, status: "COMPLETED", visitedAt: { gte: previousFrom, lt: currentFrom } },
      _sum: { netAmount: true },
    }),
  ]);

  const currentByBarber = new Map(current.map((row) => [row.barberId, Number(row._sum.netAmount ?? 0)]));
  const dropped: { barberId: string; barberName: string; currentNet: number; previousNet: number; dropPercent: number }[] = [];

  for (const row of previous) {
    const previousNet = Number(row._sum.netAmount ?? 0);
    // نتجاهل الأرقام الصغيرة: انخفاض من 50 إلى 30 ليس إشارة إدارية.
    if (previousNet < 200) continue;
    const currentNet = currentByBarber.get(row.barberId) ?? 0;
    const drop = (previousNet - currentNet) / previousNet;
    if (drop > DROP_THRESHOLD) {
      dropped.push({
        barberId: row.barberId,
        barberName: "",
        currentNet,
        previousNet,
        dropPercent: Math.round(drop * 100),
      });
    }
  }

  if (dropped.length === 0) return [];

  const barbers = await prisma.barber.findMany({
    where: { id: { in: dropped.map((row) => row.barberId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(barbers.map((barber) => [barber.id, barber.name]));

  return dropped
    .map((row) => ({ ...row, barberName: nameById.get(row.barberId) ?? "حلاق" }))
    .sort((a, b) => b.dropPercent - a.dropPercent)
    .slice(0, 3);
}

/** حلاقون تكرّر لديهم فرق الصندوق — مؤشر رقابي لا اتهام. */
async function getRepeatedCashGaps(
  prisma: PrismaClient,
  organizationId: string,
  salonFilter: { salonId?: { in: string[] } },
  now: Date,
) {
  const sessions = await prisma.cashSession.findMany({
    where: {
      organizationId,
      ...salonFilter,
      status: "CLOSED",
      closedAt: { gte: new Date(now.getTime() - 30 * DAY_MS) },
    },
    include: { barber: { select: { id: true, name: true } } },
  });

  const byBarber = new Map<string, { barberId: string; barberName: string; count: number; totalDifference: number }>();

  for (const session of sessions) {
    const expected = Number(session.openingCashAmount) + Number(session.cashTotal) - Number(session.expensesTotal) - Number(session.collectionsTotal);
    const received = session.cashReceivedAmount == null ? expected : Number(session.cashReceivedAmount);
    const difference = roundMoney(received - expected);
    if (Math.abs(difference) < 1) continue;

    const row = byBarber.get(session.barberId) ?? {
      barberId: session.barberId,
      barberName: session.barber.name,
      count: 0,
      totalDifference: 0,
    };
    row.count += 1;
    row.totalDifference += difference;
    byBarber.set(session.barberId, row);
  }

  return [...byBarber.values()].filter((row) => row.count >= 3).sort((a, b) => b.count - a.count);
}

function dashboardCacheTtl() {
  const configured = Number(process.env.DASHBOARD_CACHE_TTL_SECONDS);
  return Number.isFinite(configured) ? Math.min(60, Math.max(2, Math.trunc(configured))) : 10;
}
