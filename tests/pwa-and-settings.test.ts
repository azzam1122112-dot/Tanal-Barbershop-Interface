import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hashBarberPin } from "../lib/auth/barber-pin";
import { canAccessDashboard } from "../lib/auth/access";
import { getBarberTodaySummary } from "../lib/barber/barber-summary";
import { toSafeSystemSettings, updateSystemSettings } from "../lib/settings/system-settings";

const prisma = new PrismaClient();
const createdBarberIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdServiceIds: string[] = [];
const createdVisitIds: string[] = [];

let adminUserId = "";
let barberId = "";
let serviceId = "";
let customerId = "";
let originalSettings: ReturnType<typeof toSafeSystemSettings>;

describe("pwa and settings polish", () => {
  beforeAll(async () => {
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } })).id;
    const settings = await prisma.systemSettings.findFirstOrThrow({});
    originalSettings = toSafeSystemSettings(settings);
    const barber = await prisma.barber.create({
      data: {
        name: `pwa-barber-${Date.now()}`,
        phone: randomSaudiPhone(),
        accessPinHash: await hashBarberPin("Tanal@123"),
        isActive: true,
      },
    });
    barberId = barber.id;
    createdBarberIds.push(barberId);
    const service = await prisma.service.create({
      data: { name: `خدمة pwa ${Date.now()}`, defaultPrice: 50, isActive: true, sortOrder: 900 },
    });
    serviceId = service.id;
    createdServiceIds.push(serviceId);
    const customer = await prisma.customer.create({
      data: {
        name: "عميل ملخص الحلاق",
        phone: randomSaudiPhone(),
        loyaltyAccount: { create: { points: 0, lifetimeEarned: 0 } },
      },
    });
    customerId = customer.id;
    createdCustomerIds.push(customerId);
    const cashVisit = await createVisit("CASH", 75);
    const networkVisit = await createVisit("NETWORK", 45);
    createdVisitIds.push(cashVisit.id, networkVisit.id);
  });

  afterAll(async () => {
    await updateSystemSettings(
      prisma,
      {
        salonName: originalSettings.salonName,
        currency: originalSettings.currency,
        pointsPerCurrencyUnit: originalSettings.pointsPerCurrencyUnit,
        whatsappEnabled: originalSettings.whatsappEnabled,
      },
      adminMeta(),
    );
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...createdVisitIds, ...createdCustomerIds, ...createdServiceIds, ...createdBarberIds] } },
          { actorBarberId: { in: createdBarberIds } },
        ],
      },
    });
    await prisma.loyaltyTransaction.deleteMany({ where: { visitId: { in: createdVisitIds } } });
    await prisma.visit.deleteMany({ where: { id: { in: createdVisitIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await prisma.barber.deleteMany({ where: { id: { in: createdBarberIds } } });
    await prisma.$disconnect();
  });

  it("has an installable manifest with barber start url and no service worker cache", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "public", "manifest.webmanifest"), "utf8")) as {
      start_url: string;
      display: string;
      dir: string;
      lang: string;
      icons: unknown[];
    };

    expect(manifest.start_url).toBe("/barber");
    expect(manifest.display).toBe("standalone");
    expect(manifest.dir).toBe("rtl");
    expect(manifest.lang).toBe("ar");
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(existsSync(join(process.cwd(), "public", "sw.js"))).toBe(false);
    expect(existsSync(join(process.cwd(), "public", "service-worker.js"))).toBe(false);
  });

  it("calculates protected barber daily summary without sensitive fields", async () => {
    const summary = await getBarberTodaySummary(prisma, barberId);
    const json = JSON.stringify(summary);

    expect(summary.visitsCount).toBe(2);
    expect(summary.cashTotal).toBe(75);
    expect(summary.networkTotal).toBe(45);
    expect(json).not.toContain("accessPinHash");
    expect(json).not.toContain("passwordHash");
  });

  it("updates safe system settings and dashboard access blocks barbers", async () => {
    const updated = await updateSystemSettings(
      prisma,
      { salonName: "صالون تانال اختبار", currency: "SAR", pointsPerCurrencyUnit: 1, whatsappEnabled: true },
      adminMeta(),
    );

    expect(updated.salonName).toBe("صالون تانال اختبار");
    expect(JSON.stringify(updated)).not.toContain("passwordHash");
    expect(canAccessDashboard({ type: "barber", id: "pwa-b", role: "BARBER", organizationId: "org_default", salonId: "salon_default", barber: { id: barberId, name: "حلاق", phone: "966500000001", role: "BARBER" } })).toBe(false);
    expect(canAccessDashboard({ type: "dashboard", id: "pwa-a", role: "ADMIN", organizationId: "org_default", salonId: null, user: { id: adminUserId, name: "مدير", email: "admin@tanal.local", role: "ADMIN" } })).toBe(true);
  });
});

async function createVisit(paymentMethod: "CASH" | "NETWORK", amount: number) {
  return prisma.visit.create({
    data: {
      customerId,
      barberId,
      grossAmount: amount,
      discountAmount: 0,
      netAmount: amount,
      paymentMethod,
      pointsEarned: amount,
      services: {
        create: {
          serviceId,
          serviceName: "خدمة pwa",
          unitPrice: amount,
          quantity: 1,
          lineTotal: amount,
        },
      },
    },
  });
}

function adminMeta() {
  return {
    actorUserId: adminUserId,
    actorType: "ADMIN" as const,
  };
}

function randomSaudiPhone() {
  return `9665${Math.floor(10000000 + Math.random() * 89999999)}`;
}
