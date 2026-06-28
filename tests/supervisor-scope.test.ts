import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { closeCashSession, openCashSession } from "../lib/cash-sessions/cash-session-service";
import { closeBarberDay } from "../lib/daily-close/daily-close-service";

const prisma = new PrismaClient();
const ORG = "org_default";

let adminUserId = "";
let salonAId = "";
let salonBId = "";
let barberAId = "";
let barberBId = "";
const cashSessionIds: string[] = [];
const dailyCloseIds: string[] = [];

describe("supervisor salon scoping (cash + daily close)", () => {
  beforeAll(async () => {
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } })).id;

    const stamp = Date.now();
    const salonA = await prisma.salon.create({
      data: { organizationId: ORG, name: `فرع المشرف ${stamp}`, slug: `sup-a-${stamp}`, isActive: true },
    });
    const salonB = await prisma.salon.create({
      data: { organizationId: ORG, name: `فرع آخر ${stamp}`, slug: `sup-b-${stamp}`, isActive: true },
    });
    salonAId = salonA.id;
    salonBId = salonB.id;

    const barberA = await prisma.barber.create({
      data: { organizationId: ORG, salonId: salonAId, name: `حلاق فرع المشرف ${stamp}`, phone: randomSaudiPhone(), accessPinHash: await hashBarberPin("Tanal@123"), isActive: true },
    });
    const barberB = await prisma.barber.create({
      data: { organizationId: ORG, salonId: salonBId, name: `حلاق الفرع الآخر ${stamp}`, phone: randomSaudiPhone(), accessPinHash: await hashBarberPin("Tanal@123"), isActive: true },
    });
    barberAId = barberA.id;
    barberBId = barberB.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...cashSessionIds, ...dailyCloseIds] } },
          { actorBarberId: { in: [barberAId, barberBId] } },
        ],
      },
    });
    await prisma.dailyClose.deleteMany({ where: { barberId: { in: [barberAId, barberBId] } } });
    await prisma.cashSession.deleteMany({ where: { barberId: { in: [barberAId, barberBId] } } });
    await prisma.barber.deleteMany({ where: { id: { in: [barberAId, barberBId] } } });
    await prisma.salon.deleteMany({ where: { id: { in: [salonAId, salonBId] } } });
    await prisma.$disconnect();
  });

  it("lets a supervisor close a cash session inside an assigned salon", async () => {
    const opened = await openCashSession(prisma, { barberId: barberAId });
    cashSessionIds.push(opened.cashSession.id);

    const closed = await closeCashSession(prisma, {
      barberId: barberAId,
      closedByUserId: adminUserId,
      closedByActorType: "SUPERVISOR",
      organizationId: ORG,
      salonIds: [salonAId],
    });

    expect(closed.status).toBe("CLOSED");
  }, 30000);

  it("blocks a supervisor from closing a cash session outside their assigned salons", async () => {
    const opened = await openCashSession(prisma, { barberId: barberBId });
    cashSessionIds.push(opened.cashSession.id);

    await expect(
      closeCashSession(prisma, {
        barberId: barberBId,
        closedByUserId: adminUserId,
        closedByActorType: "SUPERVISOR",
        organizationId: ORG,
        salonIds: [salonAId], // المشرف مسند للفرع A فقط
      }),
    ).rejects.toThrow("لا توجد جلسة صندوق مفتوحة للإغلاق");

    // تبقى الجلسة مفتوحة لأن الإغلاق رُفض.
    expect(await prisma.cashSession.count({ where: { barberId: barberBId, status: "OPEN" } })).toBe(1);
  }, 30000);

  it("blocks a supervisor daily-close on a barber outside their salons, but allows it inside", async () => {
    await expect(
      closeBarberDay(prisma, {
        barberId: barberBId,
        date: new Date(),
        receivedByUserId: adminUserId,
        receivedByActorType: "SUPERVISOR",
        organizationId: ORG,
        salonIds: [salonAId],
      }),
    ).rejects.toThrow("لا تملك صلاحية على هذا الفرع");

    const close = await closeBarberDay(prisma, {
      barberId: barberAId,
      date: new Date(),
      receivedByUserId: adminUserId,
      receivedByActorType: "SUPERVISOR",
      organizationId: ORG,
      salonIds: [salonAId],
    });
    dailyCloseIds.push(close.id);
    expect(close.barber.id).toBe(barberAId);
  }, 30000);
});

function randomSaudiPhone() {
  return `9665${Math.floor(10000000 + Math.random() * 89999999)}`;
}
