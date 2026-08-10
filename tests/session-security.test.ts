import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createStoredSession, getAuthSession } from "../lib/auth/session";

const prisma = new PrismaClient();
const createdOrganizationIds: string[] = [];

describe("live session authorization", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.$disconnect();
  });

  it("uses the live staff role and assignments instead of stale session snapshots", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const organization = await prisma.organization.create({
      data: { name: `session-org-${suffix}`, slug: `session-org-${suffix}` },
    });
    createdOrganizationIds.push(organization.id);
    const [salonA, salonB] = await Promise.all([
      prisma.salon.create({ data: { organizationId: organization.id, name: "A", slug: `a-${suffix}` } }),
      prisma.salon.create({ data: { organizationId: organization.id, name: "B", slug: `b-${suffix}` } }),
    ]);
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        name: "Session admin",
        email: `session-${suffix}@example.test`,
        phone: `9665${String(Date.now()).slice(-8)}`,
        passwordHash: "test-only-hash",
        role: "ADMIN",
      },
    });
    const stored = await createStoredSession({
      prisma,
      actorType: "ADMIN",
      actorId: user.id,
      role: "ADMIN",
      organizationId: organization.id,
      activeSalonId: salonA.id,
    });

    expect((await getAuthSession(prisma, stored.token))?.type).toBe("dashboard");

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { role: "SUPERVISOR" } }),
      prisma.staffSalon.create({
        data: { organizationId: organization.id, userId: user.id, salonId: salonB.id },
      }),
    ]);
    const demoted = await getAuthSession(prisma, stored.token);
    expect(demoted?.type).toBe("dashboard");
    if (demoted?.type !== "dashboard") throw new Error("expected dashboard session");
    expect(demoted.role).toBe("SUPERVISOR");
    expect(demoted.salonId).toBeNull();
    expect(demoted.scopedSalonIds).toEqual([salonB.id]);

    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await getAuthSession(prisma, stored.token)).toBeNull();
  });

  it("moves an existing barber session to the barber's current salon", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const organization = await prisma.organization.create({
      data: { name: `barber-session-${suffix}`, slug: `barber-session-${suffix}` },
    });
    createdOrganizationIds.push(organization.id);
    const [salonA, salonB] = await Promise.all([
      prisma.salon.create({ data: { organizationId: organization.id, name: "A", slug: `ba-${suffix}` } }),
      prisma.salon.create({ data: { organizationId: organization.id, name: "B", slug: `bb-${suffix}` } }),
    ]);
    const barber = await prisma.barber.create({
      data: {
        organizationId: organization.id,
        salonId: salonA.id,
        name: "Session barber",
        phone: `9665${String(Date.now() + 1).slice(-8)}`,
        accessPinHash: "test-only-hash",
      },
    });
    const stored = await createStoredSession({
      prisma,
      actorType: "BARBER",
      actorId: barber.id,
      role: "BARBER",
      organizationId: organization.id,
      activeSalonId: salonA.id,
    });

    await prisma.barber.update({ where: { id: barber.id }, data: { salonId: salonB.id } });
    const moved = await getAuthSession(prisma, stored.token);
    expect(moved?.type).toBe("barber");
    if (moved?.type !== "barber") throw new Error("expected barber session");
    expect(moved.salonId).toBe(salonB.id);
  });
});
