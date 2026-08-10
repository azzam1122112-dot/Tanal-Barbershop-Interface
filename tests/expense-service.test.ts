import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getExpensesReport, recordCashExpense } from "../lib/expenses/expense-service";

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
});
