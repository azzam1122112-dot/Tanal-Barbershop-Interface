import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { canAccessBarberApp, canAccessDashboard } from "../lib/auth/access";
import { serviceCreateSchema } from "../lib/auth/validation";
import { onlyActiveServices, toSafeService } from "../lib/services/service-summary";
import { writeAuditLog } from "../lib/audit/audit-log";

const prisma = new PrismaClient();
const createdIds: string[] = [];

describe("service management rules", () => {
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("allows barber app access only for barber sessions", () => {
    expect(canAccessBarberApp(null)).toBe(false);
    expect(
      canAccessBarberApp({
        type: "dashboard",
        id: "session-1",
        role: "ADMIN",
        organizationId: "org_default",
        salonId: null,
        scopedSalonIds: null,
        user: { id: "admin-1", name: "مدير", email: "admin@tanal.local", role: "ADMIN" },
      }),
    ).toBe(false);
  });

  it("prevents non-dashboard sessions from dashboard APIs", () => {
    expect(canAccessDashboard(null)).toBe(false);
    expect(
      canAccessDashboard({
        type: "barber",
        id: "session-1",
        role: "BARBER",
        organizationId: "org_default",
        salonId: "salon_default",
        barber: { id: "barber-1", name: "حلاق", phone: "966500000002", role: "BARBER" },
      }),
    ).toBe(false);
  });

  it("returns only active services for barbers", () => {
    const services = onlyActiveServices([
      { name: "معطلة", isActive: false, sortOrder: 1 },
      { name: "نشطة ب", isActive: true, sortOrder: 2 },
      { name: "نشطة أ", isActive: true, sortOrder: 1 },
    ]);

    expect(services.map((service) => service.name)).toEqual(["نشطة أ", "نشطة ب"]);
  });

  it("rejects negative service prices", () => {
    expect(serviceCreateSchema.safeParse({ name: "خدمة", defaultPrice: -1, sortOrder: 0 }).success).toBe(false);
  });

  it("writes audit log when a service is created or updated", async () => {
    const service = await prisma.service.create({
      data: {
        name: `خدمة اختبار ${Date.now()}`,
        defaultPrice: 10,
        sortOrder: 99,
      },
    });
    createdIds.push(service.id);

    await writeAuditLog({
      prisma,
      actorType: "SYSTEM",
      action: "service.created",
      entityType: "Service",
      entityId: service.id,
      after: toSafeService(service, true),
    });

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: service.id, action: "service.created" },
    });
    expect(audit).toBeTruthy();
  });

  it("does not expose sensitive fields in service responses", async () => {
    const service = await prisma.service.create({
      data: {
        name: `خدمة آمنة ${Date.now()}`,
        defaultPrice: 15,
        sortOrder: 100,
      },
    });
    createdIds.push(service.id);

    const safe = toSafeService(service, true);
    expect("passwordHash" in safe).toBe(false);
    expect("accessPinHash" in safe).toBe(false);
  });
});
