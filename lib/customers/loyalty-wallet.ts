import type { LoyaltyTransactionType, Prisma, PrismaClient } from "@prisma/client";

/**
 * محفظة ولاء العميل — **خدمات مقيّدة بالحساب حصرًا**.
 *
 * كل دالة هنا تأخذ `accountId` وتضعه في `where` من أول استعلام. لا واحدة منها
 * تقبل `organizationId` كبديل: خدمة تقبل أحدهما اختياريًا تصير يومًا ما مسارًا
 * يمرّ فيه موظف مؤسسة. خدمات اللوحة مقيّدة بالمؤسسة وتعيش في `lib/reports/*`،
 * وهذه مقيّدة بالحساب وتعيش هنا — الفصل بالملف لا بالمعامل.
 *
 * **المؤسسة هي البطاقة.** الفرع موقع حركة يظهر داخل التفاصيل، ولا يملك بطاقة
 * ولا رصيدًا. ولا تُجمع أرصدة المؤسسات: كل رصيد يُنفق حيث كُسب.
 */

type WalletPrisma = PrismaClient | Prisma.TransactionClient;

const ACTIVITY_PAGE_SIZE = 20;

export type WalletCard = {
  /** المرجع العام للبطاقة — slug المؤسسة، لا معرّف داخلي. */
  reference: string;
  organizationName: string;
  organizationActive: boolean;
  points: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  visitCount: number;
  branchCount: number;
  lastActivityAt: string | null;
  joinedAt: string;
};

/**
 * ملخّص كل بطاقات الحساب.
 *
 * **ثلاثة استعلامات ثابتة مهما بلغ عدد المؤسسات** — لا استعلام لكل بطاقة:
 * صفٌّ واحد للعضويات مع مؤسستها ورصيدها، وتجميعة واحدة للزيارات تعطي العدد
 * والفروع وآخر نشاط، وتجميعة واحدة لآخر حركة نقاط. عميل بعشرين مؤسسة يكلّف
 * ما يكلّفه عميل بواحدة.
 */
export async function getCustomerLoyaltyWallet(prisma: WalletPrisma, accountId: string): Promise<WalletCard[]> {
  const memberships = await prisma.customer.findMany({
    where: { accountId },
    select: {
      id: true,
      createdAt: true,
      visitCount: true,
      organization: { select: { name: true, slug: true, status: true } },
      loyaltyAccount: { select: { points: true, lifetimeEarned: true, lifetimeRedeemed: true } },
    },
  });
  if (memberships.length === 0) return [];

  const customerIds = memberships.map((membership) => membership.id);

  const [visitFacts, lastMovements] = await Promise.all([
    // الزيارات المؤكَّدة وحدها: الملغاة ليست تعاملًا مع الفرع.
    prisma.visit.groupBy({
      by: ["customerId", "salonId"],
      where: { customerId: { in: customerIds }, status: "COMPLETED" },
      _count: { _all: true },
      _max: { visitedAt: true },
    }),
    prisma.loyaltyTransaction.groupBy({
      by: ["customerId"],
      where: { customerId: { in: customerIds } },
      _max: { createdAt: true },
    }),
  ]);

  const visitsByCustomer = new Map<string, { visits: number; branches: Set<string>; lastVisitAt: Date | null }>();
  for (const row of visitFacts) {
    if (!row.customerId) continue;
    const entry = visitsByCustomer.get(row.customerId) ?? { visits: 0, branches: new Set<string>(), lastVisitAt: null };
    entry.visits += row._count._all;
    entry.branches.add(row.salonId);
    const visitedAt = row._max.visitedAt;
    if (visitedAt && (!entry.lastVisitAt || visitedAt > entry.lastVisitAt)) entry.lastVisitAt = visitedAt;
    visitsByCustomer.set(row.customerId, entry);
  }
  const lastMovementByCustomer = new Map(
    lastMovements.map((row) => [row.customerId, row._max.createdAt] as const),
  );

  return memberships
    .map((membership) => {
      const facts = visitsByCustomer.get(membership.id);
      const lastActivity = latest(facts?.lastVisitAt ?? null, lastMovementByCustomer.get(membership.id) ?? null);
      return {
        reference: membership.organization.slug,
        organizationName: membership.organization.name,
        organizationActive: membership.organization.status === "ACTIVE",
        points: membership.loyaltyAccount?.points ?? 0,
        lifetimeEarned: membership.loyaltyAccount?.lifetimeEarned ?? 0,
        lifetimeRedeemed: membership.loyaltyAccount?.lifetimeRedeemed ?? 0,
        visitCount: facts?.visits ?? 0,
        branchCount: facts?.branches.size ?? 0,
        lastActivityAt: lastActivity?.toISOString() ?? null,
        joinedAt: membership.createdAt.toISOString(),
      };
    })
    // الأحدث نشاطًا أولًا: العميل يبحث عن البطاقة التي استعملها للتوّ لا عن
    // أول حرف أبجدي. وبلا نشاط يقرّر تاريخ الانضمام.
    .sort((a, b) => rank(b) - rank(a));
}

function rank(card: WalletCard) {
  return new Date(card.lastActivityAt ?? card.joinedAt).getTime();
}

function latest(a: Date | null, b: Date | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export type WalletBranch = { salonId: string; name: string; active: boolean; visits: number; lastVisitAt: string | null };

export type WalletActivityEntry = {
  id: string;
  type: LoyaltyTransactionType;
  points: number;
  balanceAfter: number;
  branchName: string | null;
  description: string | null;
  createdAt: string;
};

export type WalletCardDetail = WalletCard & {
  /** الفروع التي **تعامل معها** العميل فعلًا — لا كل فروع المؤسسة. */
  branches: WalletBranch[];
  rewards: Array<{ id: string; name: string; requiredPoints: number; discountAmount: number; reachable: boolean }>;
  activity: { entries: WalletActivityEntry[]; total: number; page: number; pageSize: number };
};

/**
 * بطاقة مؤسسة واحدة.
 *
 * **الاستعلام مقيّد بالحساب من أوله** (`accountId` داخل `where`) لا بفحص ملكية
 * بعد الجلب: الفحص اللاحق يُنسى مرة فيصير ثقبَ IDOR، والقيد في الاستعلام لا
 * يُنسى. بطاقة لا يملكها الحساب تعود `null` — والصفحة تردّ 404 بلا كشف وجودها.
 */
export async function getCustomerOrganizationLoyalty(
  prisma: WalletPrisma,
  accountId: string,
  reference: string,
  options: { page?: number } = {},
): Promise<WalletCardDetail | null> {
  const membership = await prisma.customer.findFirst({
    where: { accountId, organization: { slug: reference.trim().toLowerCase() } },
    select: {
      id: true,
      createdAt: true,
      organizationId: true,
      organization: { select: { name: true, slug: true, status: true } },
      loyaltyAccount: { select: { points: true, lifetimeEarned: true, lifetimeRedeemed: true } },
    },
  });
  if (!membership) return null;

  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const skip = (page - 1) * ACTIVITY_PAGE_SIZE;

  const [visitFacts, movementCount, movements, rewards] = await Promise.all([
    prisma.visit.groupBy({
      by: ["salonId"],
      where: { customerId: membership.id, status: "COMPLETED" },
      _count: { _all: true },
      _max: { visitedAt: true },
    }),
    prisma.loyaltyTransaction.count({ where: { customerId: membership.id } }),
    // صفحة واحدة فقط: بطاقة بآلاف الحركات لا تُحمَّل كاملة لتُعرض منها عشرون.
    prisma.loyaltyTransaction.findMany({
      where: { customerId: membership.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: ACTIVITY_PAGE_SIZE,
      select: { id: true, type: true, points: true, balanceAfter: true, salonId: true, description: true, createdAt: true },
    }),
    prisma.rewardRule.findMany({
      where: { organizationId: membership.organizationId, isActive: true },
      orderBy: { requiredPoints: "asc" },
      select: { id: true, name: true, requiredPoints: true, discountAmount: true },
    }),
  ]);

  // أسماء الفروع لمرة واحدة لكل الفروع الظاهرة (نشاط + سجل حركات) — لا استعلام لكل سطر.
  const salonIds = [...new Set([...visitFacts.map((row) => row.salonId), ...movements.map((row) => row.salonId).filter(Boolean) as string[]])];
  const salons = salonIds.length
    ? await prisma.salon.findMany({ where: { id: { in: salonIds } }, select: { id: true, name: true, isActive: true } })
    : [];
  const salonById = new Map(salons.map((salon) => [salon.id, salon]));

  const points = membership.loyaltyAccount?.points ?? 0;
  const branches: WalletBranch[] = visitFacts
    .map((row) => ({
      salonId: row.salonId,
      // فرع مغلق يبقى باسمه في السجل — لا يُمحى النسب التاريخي.
      name: salonById.get(row.salonId)?.name ?? "فرع مغلق",
      active: salonById.get(row.salonId)?.isActive ?? false,
      visits: row._count._all,
      lastVisitAt: row._max.visitedAt?.toISOString() ?? null,
    }))
    .sort((a, b) => (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? ""));

  const visitCount = visitFacts.reduce((total, row) => total + row._count._all, 0);
  const lastVisitAt = visitFacts.reduce<Date | null>((latestSoFar, row) => latest(latestSoFar, row._max.visitedAt), null);
  const lastMovementAt = movements[0]?.createdAt ?? null;

  return {
    reference: membership.organization.slug,
    organizationName: membership.organization.name,
    organizationActive: membership.organization.status === "ACTIVE",
    points,
    lifetimeEarned: membership.loyaltyAccount?.lifetimeEarned ?? 0,
    lifetimeRedeemed: membership.loyaltyAccount?.lifetimeRedeemed ?? 0,
    visitCount,
    branchCount: branches.length,
    lastActivityAt: latest(lastVisitAt, lastMovementAt)?.toISOString() ?? null,
    joinedAt: membership.createdAt.toISOString(),
    branches,
    rewards: rewards.map((reward) => ({
      id: reward.id,
      name: reward.name,
      requiredPoints: reward.requiredPoints,
      discountAmount: Number(reward.discountAmount),
      reachable: points >= reward.requiredPoints,
    })),
    activity: {
      entries: movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        points: movement.points,
        balanceAfter: movement.balanceAfter,
        branchName: movement.salonId ? salonById.get(movement.salonId)?.name ?? "فرع مغلق" : null,
        description: movement.description,
        createdAt: movement.createdAt.toISOString(),
      })),
      total: movementCount,
      page,
      pageSize: ACTIVITY_PAGE_SIZE,
    },
  };
}

/** أسماء عربية لأنواع الحركة — لا تُعرض قيم enum التقنية للعميل. */
export const LOYALTY_MOVEMENT_LABEL: Record<LoyaltyTransactionType, string> = {
  EARN: "اكتساب نقاط",
  REDEEM: "استبدال",
  REVERSAL: "إلغاء/عكس عملية",
  ADJUST: "تسوية",
  EXPIRE: "انتهاء صلاحية",
};
