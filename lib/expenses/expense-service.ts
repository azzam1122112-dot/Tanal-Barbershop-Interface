import type { ExpenseCategory, Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { roundMoney } from "@/lib/visits/visit-totals";

type ExpensePrisma = PrismaClient | Prisma.TransactionClient;

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  SUPPLIES: "مستلزمات",
  MAINTENANCE: "صيانة",
  UTILITIES: "فواتير وخدمات",
  STAFF_ADVANCE: "سلفة موظف",
  REFUND: "إرجاع مبلغ لعميل",
  OTHER: "أخرى",
};

export type RecordExpenseInput = {
  organizationId: string;
  salonId: string;
  cashSessionId?: string | null;
  barberId?: string | null;
  amount: number;
  category: ExpenseCategory;
  note: string;
  recordedByUserId?: string | null;
  recordedByBarberId?: string | null;
  auditMeta?: { ipAddress?: string | null; userAgent?: string | null };
};

/**
 * يسجّل مصروفًا نثريًا من درج الكاش.
 * يُربط بجلسة الصندوق المفتوحة إن وُجدت حتى يُخصم من الكاش المتوقع عند الإغلاق،
 * فيصبح فرق الصندوق مفسَّرًا بدل أن يظهر كعجز.
 */
export async function recordCashExpense(prisma: PrismaClient, input: RecordExpenseInput) {
  if (!(input.amount > 0)) {
    throw new BusinessError("قيمة المصروف يجب أن تكون أكبر من صفر");
  }
  if (!input.note.trim()) {
    throw new BusinessError("اكتب سبب المصروف");
  }

  return prisma.$transaction(async (tx) => {
    let cashSessionId = input.cashSessionId ?? null;

    if (cashSessionId) {
      const session = await tx.cashSession.findFirst({
        where: { id: cashSessionId, organizationId: input.organizationId, salonId: input.salonId },
        select: { id: true, status: true },
      });
      if (!session) throw new BusinessError("جلسة الصندوق غير موجودة", 404);
      if (session.status === "CLOSED") {
        throw new BusinessError("لا يمكن إضافة مصروف على جلسة صندوق مغلقة", 409);
      }
    } else if (input.barberId) {
      const open = await tx.cashSession.findFirst({
        where: { barberId: input.barberId, status: "OPEN" },
        select: { id: true },
      });
      cashSessionId = open?.id ?? null;
    }

    const expense = await tx.cashExpense.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        cashSessionId,
        barberId: input.barberId ?? null,
        amount: roundMoney(input.amount),
        category: input.category,
        note: input.note.trim(),
        recordedByUserId: input.recordedByUserId ?? null,
        recordedByBarberId: input.recordedByBarberId ?? null,
      },
      include: { barber: { select: { id: true, name: true } } },
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        actorType: input.recordedByBarberId ? "BARBER" : "ADMIN",
        actorUserId: input.recordedByUserId ?? null,
        actorBarberId: input.recordedByBarberId ?? null,
        action: "cash_expense.recorded",
        entityType: "CashExpense",
        entityId: expense.id,
        after: {
          amount: Number(expense.amount),
          category: expense.category,
          note: expense.note,
          cashSessionId,
        },
        ipAddress: input.auditMeta?.ipAddress,
        userAgent: input.auditMeta?.userAgent,
      },
    });

    return toExpenseRow(expense);
  });
}

/** حذف مصروف — متاح قبل إغلاق الجلسة فقط حتى لا تتغيّر أرقام إغلاق محفوظة. */
export async function deleteCashExpense(
  prisma: PrismaClient,
  expenseId: string,
  scope: { organizationId: string; salonIds?: string[] | null; actorUserId: string; actorType: "OWNER" | "ADMIN" | "SUPERVISOR" },
) {
  return prisma.$transaction(async (tx) => {
    const expense = await tx.cashExpense.findFirst({
      where: {
        id: expenseId,
        organizationId: scope.organizationId,
        ...(scope.salonIds && scope.salonIds.length > 0 ? { salonId: { in: scope.salonIds } } : {}),
      },
      include: { cashSession: { select: { status: true } } },
    });
    if (!expense) throw new BusinessError("المصروف غير موجود", 404);
    if (expense.cashSession && expense.cashSession.status === "CLOSED") {
      throw new BusinessError("لا يمكن حذف مصروف على جلسة صندوق مغلقة", 409);
    }

    await tx.cashExpense.delete({ where: { id: expense.id } });
    await tx.auditLog.create({
      data: {
        organizationId: scope.organizationId,
        salonId: expense.salonId,
        actorType: scope.actorType,
        actorUserId: scope.actorUserId,
        action: "cash_expense.deleted",
        entityType: "CashExpense",
        entityId: expense.id,
        before: { amount: Number(expense.amount), category: expense.category, note: expense.note },
      },
    });

    return { id: expense.id };
  });
}

export async function getSessionExpenses(prisma: ExpensePrisma, cashSessionId: string) {
  const expenses = await prisma.cashExpense.findMany({
    where: { cashSessionId },
    include: { barber: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return expenses.map(toExpenseRow);
}

export async function sumSessionExpenses(prisma: ExpensePrisma, cashSessionId: string) {
  const result = await prisma.cashExpense.aggregate({
    where: { cashSessionId },
    _sum: { amount: true },
  });
  return roundMoney(Number(result._sum.amount ?? 0));
}

export async function getExpensesReport(
  prisma: ExpensePrisma,
  filters: { organizationId?: string | null; salonIds?: string[] | null; from?: Date | string | null; to?: Date | string | null } = {},
) {
  const from = filters.from ? new Date(filters.from) : startOfMonth();
  const to = filters.to ? endExclusive(filters.to) : endExclusive(new Date());

  const expenses = await prisma.cashExpense.findMany({
    where: {
      createdAt: { gte: from, lt: to },
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      ...(filters.salonIds && filters.salonIds.length > 0 ? { salonId: { in: filters.salonIds } } : {}),
    },
    include: { barber: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const byCategory = new Map<ExpenseCategory, number>();
  for (const expense of expenses) {
    byCategory.set(expense.category, roundMoney((byCategory.get(expense.category) ?? 0) + Number(expense.amount)));
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    rows: expenses.map(toExpenseRow),
    total: roundMoney(expenses.reduce((total, expense) => total + Number(expense.amount), 0)),
    byCategory: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, label: EXPENSE_CATEGORY_LABELS[category], amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

function toExpenseRow(
  expense: Prisma.CashExpenseGetPayload<{ include: { barber: { select: { id: true; name: true } } } }>,
) {
  return {
    id: expense.id,
    amount: Number(expense.amount),
    category: expense.category,
    categoryLabel: EXPENSE_CATEGORY_LABELS[expense.category],
    note: expense.note,
    barber: expense.barber ? { id: expense.barber.id, name: expense.barber.name } : null,
    cashSessionId: expense.cashSessionId,
    createdAt: expense.createdAt.toISOString(),
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
