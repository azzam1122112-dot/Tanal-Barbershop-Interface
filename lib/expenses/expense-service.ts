import { Prisma, type AuditActorType, type ExpenseCategory, type ExpensePaymentSource, type PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { roundMoney } from "@/lib/visits/visit-totals";
import { recordBarberCashDelta } from "@/lib/cash-custody/cash-custody-service";

type ExpensePrisma = PrismaClient | Prisma.TransactionClient;

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  SUPPLIES: "مستلزمات",
  MAINTENANCE: "صيانة",
  UTILITIES: "فواتير وخدمات",
  STAFF_ADVANCE: "سلفة موظف",
  REFUND: "إرجاع مبلغ لعميل",
  OTHER: "أخرى",
};

export const EXPENSE_PAYMENT_SOURCE_LABELS: Record<ExpensePaymentSource, string> = {
  CASH_DRAWER: "من درج الكاش",
  EXTERNAL: "دفع خارجي",
};

export type RecordExpenseInput = {
  organizationId: string;
  salonId: string;
  cashSessionId?: string | null;
  barberId?: string | null;
  amount: number;
  category: ExpenseCategory;
  paymentSource?: ExpensePaymentSource;
  note: string;
  payee?: string | null;
  reference?: string | null;
  expenseDate?: Date | string | null;
  recordedByUserId?: string | null;
  recordedByBarberId?: string | null;
  recordedByActorType?: Extract<AuditActorType, "OWNER" | "ADMIN" | "SUPERVISOR">;
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

  const expenseDate = input.expenseDate ? startOfDay(input.expenseDate) : new Date();
  const tomorrow = startOfDay(new Date());
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (Number.isNaN(expenseDate.getTime())) throw new BusinessError("تاريخ المصروف غير صحيح");
  if (expenseDate >= tomorrow) throw new BusinessError("لا يمكن تسجيل مصروف بتاريخ مستقبلي");

  return runSerializableExpenseTransaction(prisma, async (tx) => {
    let cashSessionId = input.cashSessionId ?? null;
    let barberId = input.barberId ?? null;
    const paymentSource = input.paymentSource ?? "CASH_DRAWER";

    if (barberId) {
      const barber = await tx.barber.findFirst({
        where: {
          id: barberId,
          organizationId: input.organizationId,
          salonId: input.salonId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!barber) throw new BusinessError("الحلاق غير موجود في هذا الفرع", 404);
    }

    if (cashSessionId) {
      const session = await tx.cashSession.findFirst({
        where: {
          id: cashSessionId,
          organizationId: input.organizationId,
          salonId: input.salonId,
          ...(barberId ? { barberId } : {}),
        },
        select: { id: true, status: true, barberId: true },
      });
      if (!session) throw new BusinessError("جلسة الصندوق غير موجودة", 404);
      if (session.status === "CLOSED") {
        throw new BusinessError("لا يمكن إضافة مصروف على جلسة صندوق مغلقة", 409);
      }
      barberId = session.barberId;
    } else if (barberId) {
      const open = await tx.cashSession.findFirst({
        where: {
          barberId,
          organizationId: input.organizationId,
          salonId: input.salonId,
          status: "OPEN",
        },
        select: { id: true },
      });
      cashSessionId = open?.id ?? null;
    }

    if (paymentSource === "CASH_DRAWER" && !cashSessionId) {
      throw new BusinessError("حدد جلسة صندوق مفتوحة للمصروف المدفوع من الدرج");
    }

    const expense = await tx.cashExpense.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        cashSessionId,
        barberId,
        amount: roundMoney(input.amount),
        category: input.category,
        paymentSource,
        note: input.note.trim(),
        payee: input.payee?.trim() || null,
        reference: input.reference?.trim() || null,
        expenseDate,
        recordedByUserId: input.recordedByUserId ?? null,
        recordedByBarberId: input.recordedByBarberId ?? null,
      },
      include: {
        barber: { select: { id: true, name: true } },
        salon: { select: { id: true, name: true } },
        cashSession: { select: { status: true } },
      },
    });

    if (paymentSource === "CASH_DRAWER" && barberId) {
      await recordBarberCashDelta(tx, {
        organizationId: input.organizationId,
        salonId: input.salonId,
        barberId,
        cashSessionId,
        amount: -Number(expense.amount),
        type: "CASH_EXPENSE",
        referenceKey: `EXPENSE:CASH:${expense.id}`,
        referenceId: expense.id,
        note: expense.note,
        actorType: input.recordedByBarberId ? "BARBER" : (input.recordedByActorType ?? "ADMIN"),
        actorUserId: input.recordedByUserId,
        actorBarberId: input.recordedByBarberId,
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        actorType: input.recordedByBarberId ? "BARBER" : (input.recordedByActorType ?? "ADMIN"),
        actorUserId: input.recordedByUserId ?? null,
        actorBarberId: input.recordedByBarberId ?? null,
        action: "cash_expense.recorded",
        entityType: "CashExpense",
        entityId: expense.id,
        after: {
          amount: Number(expense.amount),
          category: expense.category,
          paymentSource: expense.paymentSource,
          note: expense.note,
          payee: expense.payee,
          reference: expense.reference,
          expenseDate: expense.expenseDate.toISOString(),
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
  return runSerializableExpenseTransaction(prisma, async (tx) => {
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

    if (expense.paymentSource === "CASH_DRAWER" && expense.barberId) {
      await recordBarberCashDelta(tx, {
        organizationId: expense.organizationId,
        salonId: expense.salonId,
        barberId: expense.barberId,
        cashSessionId: expense.cashSessionId,
        amount: Number(expense.amount),
        type: "EXPENSE_REVERSAL",
        referenceKey: `EXPENSE:REVERSAL:${expense.id}`,
        referenceId: expense.id,
        note: `عكس مصروف محذوف: ${expense.note}`,
        actorType: scope.actorType,
        actorUserId: scope.actorUserId,
      });
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
    include: {
      barber: { select: { id: true, name: true } },
      salon: { select: { id: true, name: true } },
      cashSession: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return expenses.map((expense) => toExpenseRow(expense));
}

export async function sumSessionExpenses(prisma: ExpensePrisma, cashSessionId: string) {
  const result = await prisma.cashExpense.aggregate({
    where: { cashSessionId, paymentSource: "CASH_DRAWER" },
    _sum: { amount: true },
  });
  return roundMoney(Number(result._sum.amount ?? 0));
}

export async function getExpensesReport(
  prisma: ExpensePrisma,
  filters: {
    organizationId?: string | null;
    salonIds?: string[] | null;
    from?: Date | string | null;
    to?: Date | string | null;
    category?: ExpenseCategory | null;
    paymentSource?: ExpensePaymentSource | null;
  } = {},
) {
  const from = filters.from ? startOfDay(filters.from) : startOfMonth();
  // الصفحات الداخلية تمرر حدًا علويًا حصريًا جاهزًا كـ Date، بينما الـ API
  // يستقبل تاريخًا نصيًا شاملًا ويحتاج تحويله إلى بداية اليوم التالي.
  const to = filters.to instanceof Date
    ? new Date(filters.to)
    : filters.to
      ? endExclusive(filters.to)
      : endExclusive(new Date());

  const where: Prisma.CashExpenseWhereInput = {
    expenseDate: { gte: from, lt: to },
    ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
    ...(filters.salonIds && filters.salonIds.length > 0 ? { salonId: { in: filters.salonIds } } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.paymentSource ? { paymentSource: filters.paymentSource } : {}),
  };

  const [expenses, totalRow, categoryRows, sourceRows] = await Promise.all([
    prisma.cashExpense.findMany({
      where,
      include: {
        barber: { select: { id: true, name: true } },
        salon: { select: { id: true, name: true } },
        cashSession: { select: { status: true } },
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    }),
    prisma.cashExpense.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
    prisma.cashExpense.groupBy({ by: ["category"], where, _sum: { amount: true } }),
    prisma.cashExpense.groupBy({ by: ["paymentSource"], where, _sum: { amount: true } }),
  ]);

  const userIds = [...new Set(expenses.flatMap((expense) => (expense.recordedByUserId ? [expense.recordedByUserId] : [])))];
  const barberIds = [...new Set(expenses.flatMap((expense) => (expense.recordedByBarberId ? [expense.recordedByBarberId] : [])))];
  const [users, actorBarbers] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds }, ...(filters.organizationId ? { organizationId: filters.organizationId } : {}) },
          select: { id: true, name: true, role: true },
        })
      : Promise.resolve([]),
    barberIds.length > 0
      ? prisma.barber.findMany({
          where: { id: { in: barberIds }, ...(filters.organizationId ? { organizationId: filters.organizationId } : {}) },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const barbersById = new Map(actorBarbers.map((barber) => [barber.id, barber]));
  const sourceTotals = new Map(sourceRows.map((row) => [row.paymentSource, Number(row._sum.amount ?? 0)]));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    rows: expenses.map((expense) =>
      toExpenseRow(expense, {
        user: expense.recordedByUserId ? usersById.get(expense.recordedByUserId) : null,
        barber: expense.recordedByBarberId ? barbersById.get(expense.recordedByBarberId) : null,
      }),
    ),
    count: totalRow._count._all,
    total: roundMoney(Number(totalRow._sum.amount ?? 0)),
    cashDrawerTotal: roundMoney(sourceTotals.get("CASH_DRAWER") ?? 0),
    externalTotal: roundMoney(sourceTotals.get("EXTERNAL") ?? 0),
    byCategory: categoryRows
      .map((row) => ({ category: row.category, label: EXPENSE_CATEGORY_LABELS[row.category], amount: roundMoney(Number(row._sum.amount ?? 0)) }))
      .sort((a, b) => b.amount - a.amount),
  };
}

function toExpenseRow(
  expense: Prisma.CashExpenseGetPayload<{
    include: {
      barber: { select: { id: true; name: true } };
      salon: { select: { id: true; name: true } };
      cashSession: { select: { status: true } };
    };
  }>,
  actor?: {
    user?: { id: string; name: string; role: string } | null;
    barber?: { id: string; name: string } | null;
  },
) {
  return {
    id: expense.id,
    amount: Number(expense.amount),
    category: expense.category,
    categoryLabel: EXPENSE_CATEGORY_LABELS[expense.category],
    paymentSource: expense.paymentSource,
    paymentSourceLabel: EXPENSE_PAYMENT_SOURCE_LABELS[expense.paymentSource],
    note: expense.note,
    payee: expense.payee,
    reference: expense.reference,
    salon: { id: expense.salon.id, name: expense.salon.name },
    barber: expense.barber ? { id: expense.barber.id, name: expense.barber.name } : null,
    recordedBy: actor?.user
      ? { id: actor.user.id, name: actor.user.name, type: actor.user.role }
      : actor?.barber
        ? { id: actor.barber.id, name: actor.barber.name, type: "BARBER" }
        : null,
    cashSessionId: expense.cashSessionId,
    locked: expense.cashSession?.status === "CLOSED",
    expenseDate: expense.expenseDate.toISOString(),
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

function startOfDay(date: Date | string) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

async function runSerializableExpenseTransaction<T>(
  prisma: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 25));
    }
  }
  throw new BusinessError("تعذر تسجيل حركة المصروف بعد عدة محاولات");
}
