import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { deleteCashExpense, getExpensesReport, recordCashExpense } from "../lib/expenses/expense-service";

/** بيئة حذف مصروف: مصروف درج مربوط بجلسة، مع دفتر عهدة يقبل العكس. */
function deletionTx(overrides: { sessionStatus?: "OPEN" | "CLOSED"; expense?: unknown } = {}) {
  const expense = overrides.expense ?? {
    id: "expense-9",
    organizationId: "org-1",
    salonId: "salon-1",
    cashSessionId: "session-1",
    barberId: "barber-1",
    amount: 25,
    category: "SUPPLIES",
    paymentSource: "CASH_DRAWER",
    note: "شراء شامبو",
    cashSession: { status: overrides.sessionStatus ?? "OPEN" },
  };

  return {
    cashExpense: {
      findFirst: vi.fn().mockResolvedValue(expense),
      delete: vi.fn().mockResolvedValue({ id: "expense-9" }),
    },
    cashCustodyMovement: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    barberCashBalance: {
      upsert: vi.fn().mockResolvedValue({ barberId: "barber-1", balance: 10, isInitialized: true }),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("خدمة مصروفات الفروع", () => {
  it("يسجل الدفع الخارجي دون جلسة صندوق ويحفظ دور مدير الفرع الحقيقي", async () => {
    const now = new Date();
    const created = {
      id: "expense-1",
      organizationId: "org-1",
      salonId: "salon-1",
      cashSessionId: null,
      barberId: null,
      amount: 75,
      category: "MAINTENANCE" as const,
      paymentSource: "EXTERNAL" as const,
      note: "إصلاح كرسي",
      payee: "شركة الصيانة",
      reference: "INV-10",
      recordedByUserId: "user-1",
      recordedByBarberId: null,
      expenseDate: now,
      createdAt: now,
      updatedAt: now,
      barber: null,
      salon: { id: "salon-1", name: "الفرع الأول" },
      cashSession: null,
    };
    const tx = {
      barber: { findFirst: vi.fn() },
      cashSession: { findFirst: vi.fn() },
      cashExpense: { create: vi.fn().mockResolvedValue(created) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) } as unknown as PrismaClient;

    const result = await recordCashExpense(prisma, {
      organizationId: "org-1",
      salonId: "salon-1",
      amount: 75,
      category: "MAINTENANCE",
      paymentSource: "EXTERNAL",
      note: "إصلاح كرسي",
      payee: "شركة الصيانة",
      reference: "INV-10",
      recordedByUserId: "user-1",
      recordedByActorType: "SUPERVISOR",
    });

    expect(result.paymentSource).toBe("EXTERNAL");
    expect(tx.cashSession.findFirst).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorType: "SUPERVISOR", actorUserId: "user-1" }),
    });
  });

  it("يرفض مصروف الدرج إذا لم تُحدد جلسة صندوق مفتوحة", async () => {
    const tx = {
      barber: { findFirst: vi.fn() },
      cashSession: { findFirst: vi.fn() },
      cashExpense: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) } as unknown as PrismaClient;

    await expect(recordCashExpense(prisma, {
      organizationId: "org-1",
      salonId: "salon-1",
      amount: 20,
      category: "SUPPLIES",
      paymentSource: "CASH_DRAWER",
      note: "مواد تنظيف",
    })).rejects.toThrow("حدد جلسة صندوق مفتوحة");
    expect(tx.cashExpense.create).not.toHaveBeenCalled();
  });

  it("يحسب إجماليات التقرير من كل السجلات لا من آخر 500 صف المعروضة فقط", async () => {
    const groupBy = vi.fn()
      .mockResolvedValueOnce([{ category: "SUPPLIES", _sum: { amount: 900 } }])
      .mockResolvedValueOnce([
        { paymentSource: "CASH_DRAWER", _sum: { amount: 600 } },
        { paymentSource: "EXTERNAL", _sum: { amount: 300 } },
      ]);
    const prisma = {
      cashExpense: {
        findMany: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 900 }, _count: { _all: 620 } }),
        groupBy,
      },
      user: { findMany: vi.fn() },
      barber: { findMany: vi.fn() },
    } as unknown as PrismaClient;

    const report = await getExpensesReport(prisma, { organizationId: "org-1" });

    expect(report.count).toBe(620);
    expect(report.total).toBe(900);
    expect(report.cashDrawerTotal).toBe(600);
    expect(report.externalTotal).toBe(300);
    expect(report.byCategory).toEqual([{ category: "SUPPLIES", label: "مستلزمات", amount: 900 }]);
  });

  it("يحذف الحلاق مصروف نفسه على جلسة مفتوحة ويعيد المبلغ إلى عهدته", async () => {
    const tx = deletionTx();
    const prisma = { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) } as unknown as PrismaClient;

    const result = await deleteCashExpense(prisma, "expense-9", {
      organizationId: "org-1",
      actorBarberId: "barber-1",
      actorType: "BARBER",
    });

    expect(result).toEqual({ id: "expense-9" });
    // القيد بالحلاق نفسه جزء من الاستعلام لا فحص لاحق.
    expect(tx.cashExpense.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ barberId: "barber-1" }) }),
    );
    expect(tx.cashCustodyMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "EXPENSE_REVERSAL", barberDelta: 25, actorBarberId: "barber-1" }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorType: "BARBER", actorBarberId: "barber-1" }),
    });
  });

  it("يمنع الحلاق من حذف مصروف على جلسة مغلقة", async () => {
    const tx = deletionTx({ sessionStatus: "CLOSED" });
    const prisma = { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) } as unknown as PrismaClient;

    await expect(
      deleteCashExpense(prisma, "expense-9", { organizationId: "org-1", actorBarberId: "barber-1", actorType: "BARBER" }),
    ).rejects.toThrow("لا يمكن حذف مصروف على جلسة صندوق مغلقة");
    expect(tx.cashExpense.delete).not.toHaveBeenCalled();
  });

  it("لا يجد الحلاق مصروف غيره فلا يحذفه", async () => {
    const tx = deletionTx();
    tx.cashExpense.findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) } as unknown as PrismaClient;

    await expect(
      deleteCashExpense(prisma, "expense-9", { organizationId: "org-1", actorBarberId: "barber-2", actorType: "BARBER" }),
    ).rejects.toThrow("المصروف غير موجود");
    expect(tx.cashExpense.delete).not.toHaveBeenCalled();
  });
});
