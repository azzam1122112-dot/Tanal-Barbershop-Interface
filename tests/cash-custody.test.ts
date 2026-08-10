import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashAdminPassword } from "../lib/auth/password";
import { hashBarberPin } from "../lib/auth/barber-pin";
import {
  calculateCollectionDue,
  collectBarberCash,
  initializeBarberCashBalance,
  recordBarberCashDelta,
  reverseCashCollection,
} from "../lib/cash-custody/cash-custody-service";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let organizationId = "";
let salonId = "";
let userId = "";
let barberId = "";

describe("cash custody ledger", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: `Custody ${suffix}`, slug: `custody-${suffix}`, status: "ACTIVE", subscriptionStatus: "ACTIVE" },
    });
    organizationId = organization.id;
    const salon = await prisma.salon.create({ data: { organizationId, name: "فرع العهدة", slug: `branch-${suffix}` } });
    salonId = salon.id;
    const user = await prisma.user.create({
      data: { organizationId, name: "مدير التحصيل", phone: `96650${String(Date.now()).slice(-7)}`, passwordHash: await hashAdminPassword("Tanal@123"), role: "ADMIN" },
    });
    userId = user.id;
    const barber = await prisma.barber.create({
      data: { organizationId, salonId, name: "حلاق العهدة", phone: `96651${String(Date.now()).slice(-7)}`, accessPinHash: await hashBarberPin("Tanal@123") },
    });
    barberId = barber.id;
  });

  afterAll(async () => {
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("moves a partial collection to the branch safe without creating revenue or expense", async () => {
    await initializeBarberCashBalance(prisma, {
      organizationId, salonId, barberId, countedAmount: 100, actorUserId: userId, actorType: "ADMIN",
    });
    await prisma.$transaction((tx) => recordBarberCashDelta(tx, {
      organizationId, salonId, barberId, amount: 50, type: "CASH_SALE", referenceKey: `TEST:SALE:${suffix}`,
    }));

    const [visitsBefore, expensesBefore] = await Promise.all([
      prisma.visit.count({ where: { organizationId } }),
      prisma.cashExpense.count({ where: { organizationId } }),
    ]);
    const collection = await collectBarberCash(prisma, {
      organizationId, salonId, barberId, countedAmount: 150, collectedAmount: 120,
      idempotencyKey: `collection-${suffix}`, actorUserId: userId, actorType: "ADMIN",
    });
    expect(collection.remainingAfter).toBe(30);
    expect(collection.branchSafeAfter).toBe(120);
    expect(Number((await prisma.barberCashBalance.findUniqueOrThrow({ where: { barberId } })).balance)).toBe(30);
    expect(Number((await prisma.branchCashSafe.findUniqueOrThrow({ where: { salonId } })).balance)).toBe(120);
    expect(await prisma.visit.count({ where: { organizationId } })).toBe(visitsBefore);
    expect(await prisma.cashExpense.count({ where: { organizationId } })).toBe(expensesBefore);

    const duplicate = await collectBarberCash(prisma, {
      organizationId, salonId, barberId, countedAmount: 150, collectedAmount: 120,
      idempotencyKey: `collection-${suffix}`, actorUserId: userId, actorType: "ADMIN",
    });
    expect(duplicate.id).toBe(collection.id);
    expect(Number((await prisma.branchCashSafe.findUniqueOrThrow({ where: { salonId } })).balance)).toBe(120);

    await reverseCashCollection(prisma, {
      organizationId, collectionId: collection.id, reason: "اختبار عكس إيصال خاطئ", actorUserId: userId, actorType: "ADMIN",
    });
    expect(Number((await prisma.barberCashBalance.findUniqueOrThrow({ where: { barberId } })).balance)).toBe(150);
    expect(Number((await prisma.branchCashSafe.findUniqueOrThrow({ where: { salonId } })).balance)).toBe(0);
  }, 30_000);

  it("requires a reason when the physical count differs from the ledger", async () => {
    await expect(collectBarberCash(prisma, {
      organizationId, salonId, barberId, countedAmount: 140, collectedAmount: 10,
      idempotencyKey: `difference-${suffix}`, actorUserId: userId, actorType: "ADMIN",
    })).rejects.toThrow("اكتب سبب فرق العد");
  });

  it("calculates interval, weekday and threshold reminders deterministically", () => {
    const policy = { salonId, mode: "INTERVAL" as const, intervalDays: 2, weekdays: [], thresholdAmount: null, reminderHour: 17 };
    expect(calculateCollectionDue({ isInitialized: true, balance: 100, initializedAt: "2026-08-01T10:00:00.000Z", lastCollectionAt: "2026-08-01T10:00:00.000Z", policy, now: new Date("2026-08-04T18:00:00.000Z") }).dueStatus).toBe("OVERDUE");
    expect(calculateCollectionDue({ isInitialized: true, balance: 500, initializedAt: null, lastCollectionAt: null, policy: { ...policy, mode: "DISABLED", thresholdAmount: 400 }, now: new Date("2026-08-04T18:00:00.000Z") }).dueStatus).toBe("DUE");
    expect(calculateCollectionDue({ isInitialized: false, balance: 0, initializedAt: null, lastCollectionAt: null, policy }).dueStatus).toBe("UNINITIALIZED");
  });
});
