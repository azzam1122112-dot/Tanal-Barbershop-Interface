import { describe, expect, it, vi } from "vitest";
import { getBarberMonthlyCommission } from "../lib/commissions/barber-monthly-commission";

describe("مستحق عمولة الحلاق الشهري", () => {
  it("لا يعرض بيانات العمولة ولا يجمع الزيارات عندما تكون معطلة", async () => {
    const aggregate = vi.fn();
    const db = {
      barber: { findUnique: vi.fn().mockResolvedValue({ commissionEnabled: false, commissionRate: 20 }) },
      visit: { aggregate },
    } as unknown as Parameters<typeof getBarberMonthlyCommission>[0];

    await expect(getBarberMonthlyCommission(db, "barber-1")).resolves.toBeNull();
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("يجمع المستحق المخزن للزيارات المكتملة في الشهر الحالي", async () => {
    const aggregate = vi.fn().mockResolvedValue({
      _count: { _all: 8 },
      _sum: { netAmount: 1250, commissionAmount: 187.5 },
    });
    const db = {
      barber: { findUnique: vi.fn().mockResolvedValue({ commissionEnabled: true, commissionRate: 15 }) },
      visit: { aggregate },
    } as unknown as Parameters<typeof getBarberMonthlyCommission>[0];

    const result = await getBarberMonthlyCommission(db, "barber-1", new Date(2026, 7, 15, 12));

    expect(result).toMatchObject({
      visitsCount: 8,
      commissionBase: 1250,
      commissionAmount: 187.5,
      effectiveRate: 15,
      configuredRate: 15,
    });
    expect(result?.monthLabel).toContain("أغسطس");
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ barberId: "barber-1", status: "COMPLETED" }),
      }),
    );
  });
});
