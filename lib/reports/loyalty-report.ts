import type { Prisma, PrismaClient } from "@prisma/client";

type ReportPrisma = PrismaClient | Prisma.TransactionClient;

const TOP_CUSTOMERS_LIMIT = 10;

export type LoyaltyProgramReport = Awaited<ReturnType<typeof getLoyaltyProgramReport>>;

/**
 * تقرير برنامج الولاء بمستويين مفصولين عمدًا.
 *
 * **`program` مؤسسي دائمًا** — عدد الأعضاء والرصيد القائم لا يقبلان فلتر فرع
 * لأنهما لا يوجدان على مستوى الفرع أصلًا: الرصيد وعاء واحد للمؤسسة. لو قُسّم
 * بالفرع لصار المجموع أكبر من الحقيقة (نفس العضو يُعدّ في كل فرع زاره)، ولأوحى
 * الرقم بأن للفرع محفظة.
 *
 * **`activity` وحدها تقبل الفلتر** — لأنها حركات وقعت في أمكنة، والفرع صفة
 * الحركة لا صفة الرصيد. فلتر الفرع تحليلي بحت: يغيّر ما يُقاس لا ما يملكه العميل.
 *
 * التجميع كله في القاعدة: `groupBy`/`aggregate` على أعمدة مفهرسة، فلا تُجلب
 * صفوف الدفتر إلى Node لتُجمع هناك.
 */
export async function getLoyaltyProgramReport(
  prisma: ReportPrisma,
  filters: {
    organizationId: string;
    /** فروع النطاق المسموح (المشرف)، أو الفرع المختار للتحليل. `null` = كل الفروع. */
    salonIds?: string[] | null;
    from: Date;
    to: Date;
  },
) {
  const { organizationId, from, to } = filters;
  const salonFilter = filters.salonIds && filters.salonIds.length > 0 ? { salonId: { in: filters.salonIds } } : {};
  const movementWhere: Prisma.LoyaltyTransactionWhereInput = {
    organizationId,
    createdAt: { gte: from, lt: to },
    ...salonFilter,
  };

  const [members, outstanding, byType, byBranch, topRows, loyaltyVisits, salons] = await Promise.all([
    prisma.loyaltyAccount.count({ where: { organizationId } }),
    prisma.loyaltyAccount.aggregate({ where: { organizationId }, _sum: { points: true, lifetimeEarned: true, lifetimeRedeemed: true } }),
    prisma.loyaltyTransaction.groupBy({
      by: ["type"],
      where: movementWhere,
      _sum: { points: true },
      _count: { _all: true },
    }),
    prisma.loyaltyTransaction.groupBy({
      by: ["salonId", "type"],
      where: movementWhere,
      _sum: { points: true },
      _count: { _all: true },
    }),
    prisma.loyaltyTransaction.groupBy({
      by: ["customerId"],
      where: { ...movementWhere, type: "EARN" },
      _sum: { points: true },
      _count: { _all: true },
      orderBy: { _sum: { points: "desc" } },
      take: TOP_CUSTOMERS_LIMIT,
    }),
    prisma.visit.count({
      where: {
        organizationId,
        visitedAt: { gte: from, lt: to },
        ...salonFilter,
        loyaltyTransactions: { some: {} },
      },
    }),
    prisma.salon.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  ]);

  // استعلام واحد لأسماء أفضل العملاء بدل استعلام لكل صف.
  const customers = topRows.length
    ? await prisma.customer.findMany({
        where: { id: { in: topRows.map((row) => row.customerId) }, organizationId },
        select: { id: true, name: true, phone: true, loyaltyAccount: { select: { points: true } } },
      })
    : [];
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const salonName = new Map(salons.map((salon) => [salon.id, salon.name]));

  const sumOf = (type: string) => Number(byType.find((row) => row.type === type)?._sum.points ?? 0);
  const countOf = (type: string) => byType.find((row) => row.type === type)?._count._all ?? 0;

  const pointsEarned = sumOf("EARN");
  const pointsRedeemed = Math.abs(sumOf("REDEEM"));
  const pointsReversed = sumOf("REVERSAL");
  const pointsAdjusted = sumOf("ADJUST");

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    /** مستوى البرنامج — مؤسسي بالتعريف ولا يتأثر بفلتر الفرع. */
    program: {
      members,
      outstandingPoints: outstanding._sum.points ?? 0,
      lifetimeEarned: outstanding._sum.lifetimeEarned ?? 0,
      lifetimeRedeemed: outstanding._sum.lifetimeRedeemed ?? 0,
    },
    /** مستوى النشاط — يقبل فلتر الفرع، وهو تحليلي لا يمثّل رصيدًا. */
    activity: {
      pointsEarned,
      pointsRedeemed,
      pointsReversed,
      pointsAdjusted,
      netPoints: pointsEarned - pointsRedeemed + pointsReversed + pointsAdjusted,
      earnCount: countOf("EARN"),
      redeemCount: countOf("REDEEM"),
      reversalCount: countOf("REVERSAL"),
      adjustmentCount: countOf("ADJUST"),
      loyaltyVisits,
      averageEarnPerVisit: loyaltyVisits > 0 ? Math.round(pointsEarned / loyaltyVisits) : 0,
    },
    /** توزيع النشاط على الفروع. حركة بلا فرع (تسوية إدارية) تُجمع تحت `null`. */
    branches: aggregateBranches(byBranch, salonName),
    topCustomers: topRows.map((row) => {
      const customer = customerById.get(row.customerId);
      return {
        customerId: row.customerId,
        name: customer?.name ?? "—",
        phone: customer?.phone ?? "",
        pointsEarned: Number(row._sum.points ?? 0),
        earnCount: row._count._all,
        // الرصيد الحالي مؤسسي دائمًا — لا يتغيّر بفلتر الفرع.
        currentBalance: customer?.loyaltyAccount?.points ?? 0,
      };
    }),
  };
}

type BranchGroup = {
  salonId: string | null;
  type: string;
  _sum: { points: number | null };
  _count: { _all: number };
};

function aggregateBranches(rows: BranchGroup[], salonName: Map<string, string>) {
  const branches = new Map<string, { salonId: string | null; name: string; pointsEarned: number; pointsRedeemed: number; earnCount: number; redeemCount: number; movements: number }>();

  for (const row of rows) {
    const key = row.salonId ?? "__unassigned__";
    const entry = branches.get(key) ?? {
      salonId: row.salonId,
      name: row.salonId ? salonName.get(row.salonId) ?? "فرع محذوف" : "بلا فرع",
      pointsEarned: 0,
      pointsRedeemed: 0,
      earnCount: 0,
      redeemCount: 0,
      movements: 0,
    };
    const points = Number(row._sum.points ?? 0);
    if (row.type === "EARN") {
      entry.pointsEarned += points;
      entry.earnCount += row._count._all;
    }
    if (row.type === "REDEEM") {
      entry.pointsRedeemed += Math.abs(points);
      entry.redeemCount += row._count._all;
    }
    entry.movements += row._count._all;
    branches.set(key, entry);
  }

  return [...branches.values()].sort((a, b) => b.pointsEarned - a.pointsEarned);
}
