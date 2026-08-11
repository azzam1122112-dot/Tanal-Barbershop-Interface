import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { openCashSession, closeCashSession } from "../lib/cash-sessions/cash-session-service";
import { confirmVisit } from "../lib/visits/visit-service";
import {
  getBarberCommissionBalance,
  getCommissionLedger,
  payCommission,
  reverseCommissionPayout,
} from "../lib/commissions/commission-payout";

const prisma = new PrismaClient();
const createdBarberIds: string[] = [];
const createdServiceIds: string[] = [];
const createdVisitIds: string[] = [];
const createdCashSessionIds: string[] = [];

let adminUserId = "";
let barberId = "";
let serviceId = "";

const ORG = "org_default";
const SALON = "salon_default";

describe("صرف عمولات الحلاقين", () => {
  beforeAll(async () => {
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } })).id;

    const barber = await prisma.barber.create({
      data: {
        organizationId: ORG,
        salonId: SALON,
        name: `payout-barber-${Date.now()}`,
        phone: randomSaudiPhone(),
        accessPinHash: await hashBarberPin("Tanal@123"),
        isActive: true,
        commissionEnabled: true,
        commissionRate: 50,
      },
    });
    barberId = barber.id;
    createdBarberIds.push(barberId);

    const service = await prisma.service.create({
      data: {
        organizationId: ORG,
        salonId: SALON,
        name: `خدمة صرف عمولة ${Date.now()}`,
        defaultPrice: 100,
        isActive: true,
        sortOrder: 900,
      },
    });
    serviceId = service.id;
    createdServiceIds.push(serviceId);

    const opened = await openCashSession(prisma, { barberId, openingCashAmount: 0 });
    createdCashSessionIds.push(opened.cashSession.id);
    // زيارة نقدية بـ100 ونسبة 50% → عمولة 50 وعهدة نقدية 100.
    const visit = await confirmVisit(prisma, {
      organizationId: ORG,
      salonId: SALON,
      barberId,
      serviceIds: [serviceId],
      grossAmount: 100,
      paymentMethod: "CASH",
      idempotencyKey: `payout-visit-${Date.now()}`,
    });
    createdVisitIds.push(visit.visit.id);
  }, 60000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorBarberId: { in: createdBarberIds } }, { entityType: "CommissionPayout" }] },
    });
    await prisma.cashCustodyMovement.deleteMany({ where: { barberId: { in: createdBarberIds } } });
    await prisma.commissionPayout.deleteMany({ where: { barberId: { in: createdBarberIds } } });
    await prisma.loyaltyTransaction.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } });
    await prisma.cashSession.deleteMany({ where: { id: { in: createdCashSessionIds } } });
    await prisma.barberCashBalance.deleteMany({ where: { barberId: { in: createdBarberIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
    await prisma.$disconnect();
  });

  it("يحسب المتبقي ويرفض صرف أكثر منه", async () => {
    const [row] = await getCommissionLedger(prisma, { organizationId: ORG, barberId });
    expect(row.accrued).toBe(50);
    expect(row.paid).toBe(0);
    expect(row.outstanding).toBe(50);

    await expect(
      payCommission(prisma, {
        organizationId: ORG,
        barberId,
        amount: 80,
        method: "BANK_TRANSFER",
        reference: "TRX-1",
        idempotencyKey: `over-${Date.now()}`,
        actorUserId: adminUserId,
        actorType: "ADMIN",
      }),
    ).rejects.toThrow(/المتبقي للحلاق/);
  }, 30000);

  it("الخصم من عهدة الحلاق ينقص عهدته ولا يمسّ خزنة الفرع", async () => {
    const before = await prisma.barberCashBalance.findUniqueOrThrow({ where: { barberId } });
    const safeBefore = await prisma.branchCashSafe.findUnique({ where: { salonId: SALON } });

    const payout = await payCommission(prisma, {
      organizationId: ORG,
      barberId,
      amount: 20,
      method: "BARBER_CUSTODY_DEDUCTION",
      idempotencyKey: `custody-${Date.now()}`,
      actorUserId: adminUserId,
      actorType: "ADMIN",
    });

    expect(payout.amount).toBe(20);
    expect(payout.outstandingAfter).toBe(30);

    const after = await prisma.barberCashBalance.findUniqueOrThrow({ where: { barberId } });
    expect(Number(after.balance)).toBe(Number(before.balance) - 20);

    const safeAfter = await prisma.branchCashSafe.findUnique({ where: { salonId: SALON } });
    expect(Number(safeAfter?.balance ?? 0)).toBe(Number(safeBefore?.balance ?? 0));

    const movement = await prisma.cashCustodyMovement.findFirstOrThrow({
      where: { referenceId: payout.id, type: "CUSTODY_COMMISSION_PAYOUT" },
    });
    expect(Number(movement.barberDelta)).toBe(-20);
  }, 30000);

  it("المفتاح الفريد يمنع الصرف مرتين بضغطة مكررة", async () => {
    const key = `dup-${Date.now()}`;
    const first = await payCommission(prisma, {
      organizationId: ORG,
      barberId,
      amount: 10,
      method: "BANK_TRANSFER",
      reference: "TRX-DUP",
      idempotencyKey: key,
      actorUserId: adminUserId,
      actorType: "ADMIN",
    });
    const second = await payCommission(prisma, {
      organizationId: ORG,
      barberId,
      amount: 10,
      method: "BANK_TRANSFER",
      reference: "TRX-DUP",
      idempotencyKey: key,
      actorUserId: adminUserId,
      actorType: "ADMIN",
    });

    expect(second.id).toBe(first.id);
    const count = await prisma.commissionPayout.count({ where: { barberId, idempotencyKey: key } });
    expect(count).toBe(1);
  }, 30000);

  it("التحويل البنكي يلزمه رقم حوالة", async () => {
    await expect(
      payCommission(prisma, {
        organizationId: ORG,
        barberId,
        amount: 5,
        method: "BANK_TRANSFER",
        idempotencyKey: `noref-${Date.now()}`,
        actorUserId: adminUserId,
        actorType: "ADMIN",
      }),
    ).rejects.toThrow("اكتب رقم الحوالة لتتبّع التحويل البنكي");
  }, 30000);

  it("العكس يعيد المبلغ إلى المتبقي وإلى العهدة ولا يحذف السند", async () => {
    const payout = await payCommission(prisma, {
      organizationId: ORG,
      barberId,
      amount: 5,
      method: "BARBER_CUSTODY_DEDUCTION",
      idempotencyKey: `rev-${Date.now()}`,
      actorUserId: adminUserId,
      actorType: "ADMIN",
    });
    const balanceAfterPay = await getBarberCommissionBalance(prisma, { organizationId: ORG, barberId });
    const custodyAfterPay = await prisma.barberCashBalance.findUniqueOrThrow({ where: { barberId } });

    const reversed = await reverseCommissionPayout(prisma, {
      organizationId: ORG,
      payoutId: payout.id,
      reason: "صُرف لحلاق خطأ",
      actorUserId: adminUserId,
      actorType: "ADMIN",
    });

    expect(reversed.reversedAt).not.toBeNull();
    const balanceAfterReverse = await getBarberCommissionBalance(prisma, { organizationId: ORG, barberId });
    expect(balanceAfterReverse.outstanding).toBe(balanceAfterPay.outstanding + 5);

    const custodyAfterReverse = await prisma.barberCashBalance.findUniqueOrThrow({ where: { barberId } });
    expect(Number(custodyAfterReverse.balance)).toBe(Number(custodyAfterPay.balance) + 5);

    // السند باقٍ في السجل معكوسًا لا محذوفًا.
    expect(await prisma.commissionPayout.count({ where: { id: payout.id } })).toBe(1);
    await expect(
      reverseCommissionPayout(prisma, {
        organizationId: ORG,
        payoutId: payout.id,
        reason: "محاولة ثانية",
        actorUserId: adminUserId,
        actorType: "ADMIN",
      }),
    ).rejects.toThrow("عُكس هذا الصرف مسبقًا");
  }, 30000);

  it("لا تُسجَّل تسوية افتتاحية مرتين", async () => {
    const balance = await getBarberCommissionBalance(prisma, { organizationId: ORG, barberId });
    await payCommission(prisma, {
      organizationId: ORG,
      barberId,
      amount: balance.outstanding,
      method: "OPENING_SETTLEMENT",
      idempotencyKey: `open-${Date.now()}`,
      actorUserId: adminUserId,
      actorType: "ADMIN",
    });

    await expect(
      payCommission(prisma, {
        organizationId: ORG,
        barberId,
        amount: 1,
        method: "OPENING_SETTLEMENT",
        idempotencyKey: `open2-${Date.now()}`,
        actorUserId: adminUserId,
        actorType: "ADMIN",
      }),
    ).rejects.toThrow("سُجّلت تسوية افتتاحية لهذا الحلاق مسبقًا");

    const after = await getBarberCommissionBalance(prisma, { organizationId: ORG, barberId });
    expect(after.outstanding).toBe(0);
  }, 30000);

  it("إغلاق الجلسة لا يتأثر بصرف العمولة", async () => {
    const closed = await closeCashSession(prisma, { barberId, closedByUserId: adminUserId });
    expect(closed.status).toBe("CLOSED");
  }, 30000);
});

function randomSaudiPhone() {
  return `05${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}
