import type { PrismaClient } from "@prisma/client";
import { roundMoney } from "@/lib/visits/visit-totals";
import { resolveMonthSpan, type FinancialScope } from "./financial-period";

/**
 * حركة العمولة خلال المدة لكل حلاق:
 * `رصيد أول المدة + المستحق خلال المدة − المصروف خلالها = رصيد آخر المدة`.
 *
 * دفتر العمولات نفسه تراكمي بلا فترة (وهذا صحيح للصرف: الصرف يتم من الرصيد
 * الجاري لا من مستحق شهر بعينه، وإلا صُرف مرتين عن الزيارة نفسها بتغيير
 * التاريخ). لكن المالك يحتاج أن يقرأ الشهر: كم استحق فريقي وكم دفعتُ فعلًا وكم
 * تراكم عليّ. هذه الدالة تعطيه ذلك دون أن تمسّ منطق الصرف.
 *
 * **نطاق الحلاق لا نطاق الزيارة:** الحلاقون يُختارون بفرعهم الحالي ثم تُجمع كل
 * حركتهم، تمامًا كما يفعل `getCommissionLedger`. لو جُمعت الزيارات بفرعها بدل
 * الحلاق لاختلف «رصيد آخر المدة» عن المتبقي المعروض في شاشة الصرف عند أول حلاق
 * منقول بين فرعين — رقمان متناقضان لنفس الدَّين.
 */
export type CommissionMovementRow = {
  barberId: string;
  barberName: string;
  salonName: string;
  isActive: boolean;
  commissionEnabled: boolean;
  /** المتبقي عليه قبل بداية المدة. سالب = كان مدفوعًا مقدمًا. */
  opening: number;
  accrued: number;
  /** صافي المصروف خلال المدة بعد خصم ما عُكس خلالها. */
  paid: number;
  closing: number;
  visitsCount: number;
};

export async function getCommissionMovement(
  prisma: PrismaClient,
  input: FinancialScope & { fromKey?: string | null; toKey?: string | null; now?: Date },
) {
  const span = resolveMonthSpan(input.fromKey, input.toKey, input.now ?? new Date());
  const salonIds = input.salonIds && input.salonIds.length > 0 ? input.salonIds : null;

  const barbers = await prisma.barber.findMany({
    where: {
      organizationId: input.organizationId,
      ...(salonIds ? { salonId: { in: salonIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      commissionEnabled: true,
      salon: { select: { name: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  if (barbers.length === 0) {
    return { fromKey: span.fromKey, toKey: span.toKey, rows: [], totals: emptyTotals() };
  }

  const barberIds = barbers.map((barber) => barber.id);
  const [accruedBefore, accruedIn, paidBefore, paidIn, reversedBefore, reversedIn] = await Promise.all([
    prisma.visit.groupBy({
      by: ["barberId"],
      where: { barberId: { in: barberIds }, status: "COMPLETED", visitedAt: { lt: span.from } },
      _sum: { commissionAmount: true },
    }),
    prisma.visit.groupBy({
      by: ["barberId"],
      where: { barberId: { in: barberIds }, status: "COMPLETED", visitedAt: { gte: span.from, lt: span.to } },
      _sum: { commissionAmount: true },
      _count: { _all: true },
    }),
    prisma.commissionPayout.groupBy({
      by: ["barberId"],
      where: { barberId: { in: barberIds }, paidAt: { lt: span.from } },
      _sum: { amount: true },
    }),
    prisma.commissionPayout.groupBy({
      by: ["barberId"],
      where: { barberId: { in: barberIds }, paidAt: { gte: span.from, lt: span.to } },
      _sum: { amount: true },
    }),
    // العكس يُنسب لشهر وقوعه: سند صُرف في يوليو وعُكس في أغسطس يبقى مصروفًا في
    // يوليو ويظهر ردًّا في أغسطس، فلا يتغيّر تقرير شهر أُغلق وقُرئ.
    prisma.commissionPayout.groupBy({
      by: ["barberId"],
      where: { barberId: { in: barberIds }, reversedAt: { lt: span.from } },
      _sum: { amount: true },
    }),
    prisma.commissionPayout.groupBy({
      by: ["barberId"],
      where: { barberId: { in: barberIds }, reversedAt: { gte: span.from, lt: span.to } },
      _sum: { amount: true },
    }),
  ]);

  const accruedBeforeBy = sumByBarber(accruedBefore, "commissionAmount");
  const accruedInBy = sumByBarber(accruedIn, "commissionAmount");
  const visitsInBy = new Map(accruedIn.map((row) => [row.barberId, row._count?._all ?? 0]));
  const paidBeforeBy = sumByBarber(paidBefore, "amount");
  const paidInBy = sumByBarber(paidIn, "amount");
  const reversedBeforeBy = sumByBarber(reversedBefore, "amount");
  const reversedInBy = sumByBarber(reversedIn, "amount");

  const rows: CommissionMovementRow[] = barbers.map((barber) => {
    const opening = roundMoney(
      (accruedBeforeBy.get(barber.id) ?? 0) - (paidBeforeBy.get(barber.id) ?? 0) + (reversedBeforeBy.get(barber.id) ?? 0),
    );
    const accrued = roundMoney(accruedInBy.get(barber.id) ?? 0);
    const paid = roundMoney((paidInBy.get(barber.id) ?? 0) - (reversedInBy.get(barber.id) ?? 0));

    return {
      barberId: barber.id,
      barberName: barber.name,
      salonName: barber.salon?.name ?? "",
      isActive: barber.isActive,
      commissionEnabled: barber.commissionEnabled,
      opening,
      accrued,
      paid,
      closing: roundMoney(opening + accrued - paid),
      visitsCount: visitsInBy.get(barber.id) ?? 0,
    };
  });

  // حلاق بلا أي حركة ولا رصيد قديم لا يضيف معلومة — يُخفى حتى يبقى الجدول مقروءًا.
  const visible = rows.filter((row) => row.opening !== 0 || row.accrued !== 0 || row.paid !== 0);

  return {
    fromKey: span.fromKey,
    toKey: span.toKey,
    rows: visible.sort((a, b) => b.closing - a.closing || b.accrued - a.accrued),
    totals: visible.reduce(
      (total, row) => ({
        barbersCount: total.barbersCount + 1,
        opening: roundMoney(total.opening + row.opening),
        accrued: roundMoney(total.accrued + row.accrued),
        paid: roundMoney(total.paid + row.paid),
        closing: roundMoney(total.closing + row.closing),
      }),
      emptyTotals(),
    ),
  };
}

function emptyTotals() {
  return { barbersCount: 0, opening: 0, accrued: 0, paid: 0, closing: 0 };
}

function sumByBarber<K extends string>(
  rows: { barberId: string; _sum: Partial<Record<K, unknown>> }[],
  field: K,
) {
  return new Map(rows.map((row) => [row.barberId, Number(row._sum[field] ?? 0)]));
}
