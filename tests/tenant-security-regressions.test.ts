import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getAvailableCampaigns, getEligibleCampaignOrThrow } from "../lib/campaigns/campaign-eligibility";
import { recordCashExpense } from "../lib/expenses/expense-service";
import { saveBarberPushSubscription } from "../lib/push/barber-push";

describe("tenant-boundary regression controls", () => {
  it("always scopes campaign listing and selection to the active organization", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const findFirst = vi.fn().mockResolvedValue(null);
    const fakePrisma = { campaign: { findMany, findFirst } } as unknown as PrismaClient;
    const customer = { id: "customer-a", visitCount: 0, lastVisitAt: null, loyaltyAccount: { points: 0 } };

    await getAvailableCampaigns({
      prisma: fakePrisma,
      organizationId: "org-a",
      customer,
      grossAmount: 100,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-a" }) }),
    );

    await expect(
      getEligibleCampaignOrThrow({
        prisma: fakePrisma,
        organizationId: "org-a",
        campaignId: "campaign-b",
        customer,
        grossAmount: 100,
      }),
    ).rejects.toThrow("الحملة غير متاحة");
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "campaign-b", organizationId: "org-a" } });
  });

  it("rejects a barber relation that is not owned by the expense organization and branch", async () => {
    const cashExpenseCreate = vi.fn();
    const tx = {
      barber: { findFirst: vi.fn().mockResolvedValue(null) },
      cashSession: { findFirst: vi.fn() },
      cashExpense: { create: cashExpenseCreate },
      auditLog: { create: vi.fn() },
    };
    const fakePrisma = {
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaClient;

    await expect(
      recordCashExpense(fakePrisma, {
        organizationId: "org-a",
        salonId: "salon-a",
        barberId: "barber-b",
        amount: 10,
        category: "OTHER",
        note: "اختبار عزل",
      }),
    ).rejects.toThrow("الحلاق غير موجود في هذا الفرع");
    expect(tx.barber.findFirst).toHaveBeenCalledWith({
      where: { id: "barber-b", organizationId: "org-a", salonId: "salon-a", isActive: true },
      select: { id: true },
    });
    expect(cashExpenseCreate).not.toHaveBeenCalled();
  });

  it("does not delete a push subscription owned by another session", async () => {
    const deleteMany = vi.fn();
    const tx = {
      barberPushSubscription: {
        findUnique: vi.fn().mockResolvedValue({
          sessionId: "session-b",
          organizationId: "org-b",
          barberId: "barber-b",
          session: { revokedAt: null, expiresAt: new Date(Date.now() + 60_000) },
        }),
        deleteMany,
        create: vi.fn(),
      },
    };
    const fakePrisma = {
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaClient;

    await expect(
      saveBarberPushSubscription(fakePrisma, {
        organizationId: "org-a",
        barberId: "barber-a",
        sessionId: "session-a",
        subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/shared", keys: { p256dh: "key", auth: "auth" } },
      }),
    ).rejects.toThrow("هذا الجهاز مرتبط بجلسة حلاق نشطة أخرى");
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("reclaims a push endpoint from a revoked session", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({ id: "subscription-new" });
    const tx = {
      barberPushSubscription: {
        findUnique: vi.fn().mockResolvedValue({
          sessionId: "session-old",
          organizationId: "org-b",
          barberId: "barber-b",
          session: { revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
        }),
        deleteMany,
        create,
      },
    };
    const fakePrisma = {
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    } as unknown as PrismaClient;

    await saveBarberPushSubscription(fakePrisma, {
      organizationId: "org-a",
      barberId: "barber-a",
      sessionId: "session-new",
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/reused",
        keys: { p256dh: "public-key-value-long-enough", auth: "auth-value" },
      },
    });

    expect(deleteMany).toHaveBeenNthCalledWith(1, {
      where: { endpoint: "https://fcm.googleapis.com/fcm/send/reused" },
    });
    expect(deleteMany).toHaveBeenNthCalledWith(2, { where: { sessionId: "session-new" } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: "org-a", barberId: "barber-a", sessionId: "session-new" }),
      }),
    );
  });
});
