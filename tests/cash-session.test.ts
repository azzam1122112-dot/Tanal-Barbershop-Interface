import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { openCashSession, closeCashSession } from "../lib/cash-sessions/cash-session-service";
import { createCustomerWithLoyalty } from "../lib/customers/customer-service";
import { confirmVisit } from "../lib/visits/visit-service";

const prisma = new PrismaClient();
const createdBarberIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdServiceIds: string[] = [];
const createdVisitIds: string[] = [];
const createdCashSessionIds: string[] = [];

let adminUserId = "";
let barberId = "";
let customerId = "";
let serviceId = "";

describe("cash sessions", () => {
  beforeAll(async () => {
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } })).id;
    const barber = await prisma.barber.create({
      data: {
        name: `cash-session-barber-${Date.now()}`,
        phone: randomSaudiPhone(),
        accessPinHash: await hashBarberPin("1234"),
        isActive: true,
      },
    });
    barberId = barber.id;
    createdBarberIds.push(barberId);

    const service = await prisma.service.create({
      data: { name: `خدمة جلسة صندوق ${Date.now()}`, defaultPrice: 50, isActive: true, sortOrder: 700 },
    });
    serviceId = service.id;
    createdServiceIds.push(serviceId);

    const customer = await createCustomerWithLoyalty({
      prisma,
      name: "عميل جلسة صندوق",
      phone: randomSaudiPhone(),
      createdByBarberId: barberId,
    });
    customerId = customer.customer.id;
    createdCustomerIds.push(customerId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...createdVisitIds, ...createdCashSessionIds, ...createdCustomerIds, ...createdServiceIds, ...createdBarberIds] } },
          { actorBarberId: { in: createdBarberIds } },
        ],
      },
    });
    await prisma.loyaltyTransaction.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } });
    await prisma.cashSession.deleteMany({ where: { id: { in: createdCashSessionIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
    await prisma.$disconnect();
  });

  it("requires one open cash session for visits and allows a new session after closing", async () => {
    await expect(createVisit("without-session")).rejects.toThrow("لا توجد جلسة صندوق مفتوحة");

    const firstOpen = await openCashSession(prisma, { barberId });
    createdCashSessionIds.push(firstOpen.cashSession.id);
    const secondOpen = await openCashSession(prisma, { barberId });
    expect(secondOpen.alreadyOpen).toBe(true);
    expect(secondOpen.cashSession.id).toBe(firstOpen.cashSession.id);
    expect(await prisma.cashSession.count({ where: { barberId, status: "OPEN" } })).toBe(1);

    const firstVisit = await createVisit("first-open-session");
    createdVisitIds.push(firstVisit.visit.id);
    expect(firstVisit.visit.cashSessionId).toBe(firstOpen.cashSession.id);

    const closed = await closeCashSession(prisma, { barberId, closedByUserId: adminUserId });
    expect(closed.status).toBe("CLOSED");
    await expect(createVisit("closed-session")).rejects.toThrow("لا توجد جلسة صندوق مفتوحة");

    const newOpen = await openCashSession(prisma, { barberId });
    createdCashSessionIds.push(newOpen.cashSession.id);
    expect(newOpen.cashSession.id).not.toBe(firstOpen.cashSession.id);
    const secondVisit = await createVisit("second-open-session");
    createdVisitIds.push(secondVisit.visit.id);
    expect(secondVisit.visit.cashSessionId).toBe(newOpen.cashSession.id);
  }, 30000);
});

function createVisit(key: string) {
  return confirmVisit(prisma, {
    customerId,
    barberId,
    serviceIds: [serviceId],
    grossAmount: 60,
    paymentMethod: "CASH",
    idempotencyKey: `cash-session-${key}-${Date.now()}`,
  });
}

function randomSaudiPhone() {
  return `9665${Math.floor(10000000 + Math.random() * 89999999)}`;
}
