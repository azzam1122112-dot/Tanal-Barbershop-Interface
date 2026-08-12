import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createSupplyItem,
  listSupplyItems,
  reportSupplyShortage,
  resolveSupplyReport,
} from "../lib/supplies/supply-service";

/**
 * البلاغ حالة فرع لا حالة حلاق: أول من يبلّغ يفتح البلاغ، وبقية الحلاقين
 * يرونه ولا يكرّرونه، ومن وجد الصنف نفد فعلًا يرفع الحالة.
 */

const prisma = new PrismaClient();
const ORG = "org_default";
const SALON = "salon_default";
let adminUserId = "";
let barberA = "";
let barberB = "";
let itemId = "";

describe("بلاغات المستلزمات التشغيلية", () => {
  beforeAll(async () => {
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } })).id;
    const barbers = await prisma.barber.findMany({
      where: { organizationId: ORG, salonId: SALON, isActive: true },
      select: { id: true },
      take: 2,
    });
    barberA = barbers[0].id;
    barberB = barbers[1]?.id ?? barbers[0].id;

    const item = await createSupplyItem(prisma, {
      organizationId: ORG,
      salonId: SALON,
      name: `أمواس اختبار ${Date.now()}`,
      unit: "علبة",
      actorUserId: adminUserId,
      actorType: "ADMIN",
    });
    itemId = item.id;
  }, 60000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityType: { in: ["SupplyItem", "SupplyReport"] } } });
    await prisma.supplyReport.deleteMany({ where: { supplyItemId: itemId } });
    await prisma.supplyItem.deleteMany({ where: { id: itemId } });
    await prisma.$disconnect();
  }, 60000);

  it("الصنف يولد متوفرًا بلا أي حقل مالي", async () => {
    const [item] = await listSupplyItems(prisma, { organizationId: ORG, salonIds: [SALON] });
    const stored = await prisma.supplyItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item ?? stored).toBeTruthy();
    expect(stored.status).toBe("AVAILABLE");
    // لا سعر ولا تكلفة ولا كمية في النموذج أصلًا.
    expect(Object.keys(stored)).not.toContain("price");
    expect(Object.keys(stored)).not.toContain("quantity");
  }, 30000);

  it("أول بلاغ يفتح الحالة ويظهر لكل الفرع", async () => {
    const result = await reportSupplyShortage(prisma, {
      organizationId: ORG, salonId: SALON, barberId: barberA, itemId, status: "LOW",
    });
    expect(result.alreadyOpen).toBe(false);
    expect(result.report.status).toBe("LOW");

    const items = await listSupplyItems(prisma, { organizationId: ORG, salonIds: [SALON] });
    const item = items.find((row) => row.id === itemId);
    expect(item?.status).toBe("LOW");
    expect(item?.openReport?.barberName).toBeTruthy();
  }, 30000);

  it("زميل آخر لا يفتح بلاغًا ثانيًا لنفس الصنف", async () => {
    const result = await reportSupplyShortage(prisma, {
      organizationId: ORG, salonId: SALON, barberId: barberB, itemId, status: "LOW",
    });
    expect(result.alreadyOpen).toBe(true);
    expect(result.escalated).toBe(false);

    const openCount = await prisma.supplyReport.count({ where: { supplyItemId: itemId, state: "OPEN" } });
    expect(openCount).toBe(1);
  }, 30000);

  it("من وجده نفد فعلًا يرفع البلاغ القائم ولا ينشئ غيره", async () => {
    const result = await reportSupplyShortage(prisma, {
      organizationId: ORG, salonId: SALON, barberId: barberB, itemId, status: "OUT",
    });
    expect(result.escalated).toBe(true);
    expect(result.report.status).toBe("OUT");

    const openCount = await prisma.supplyReport.count({ where: { supplyItemId: itemId, state: "OPEN" } });
    expect(openCount).toBe(1);

    const item = await prisma.supplyItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.status).toBe("OUT");
  }, 30000);

  it("«تم التوريد» يعيد الصنف متوفرًا ويقفل البلاغ", async () => {
    const open = await prisma.supplyReport.findFirstOrThrow({ where: { supplyItemId: itemId, state: "OPEN" } });
    const resolved = await resolveSupplyReport(prisma, {
      organizationId: ORG, reportId: open.id, decision: "RESTOCKED",
      actorUserId: adminUserId, actorType: "ADMIN",
    });
    expect(resolved.state).toBe("RESOLVED");

    const item = await prisma.supplyItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.status).toBe("AVAILABLE");
    expect(item.lastRestockedAt).not.toBeNull();
  }, 30000);

  it("بعد التوريد يمكن فتح بلاغ جديد", async () => {
    const again = await reportSupplyShortage(prisma, {
      organizationId: ORG, salonId: SALON, barberId: barberA, itemId, status: "OUT",
    });
    expect(again.alreadyOpen).toBe(false);

    // والتجاهل يقفل البلاغ ولا يعيد الصنف متوفرًا: النقص باقٍ حتى يورَّد.
    const dismissed = await resolveSupplyReport(prisma, {
      organizationId: ORG, reportId: again.report.id, decision: "DISMISS",
      actorUserId: adminUserId, actorType: "ADMIN",
    });
    expect(dismissed.state).toBe("DISMISSED");
    const item = await prisma.supplyItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.status).toBe("OUT");
  }, 30000);

  it("لا يُعالج بلاغ خارج نطاق الفروع", async () => {
    const open = await reportSupplyShortage(prisma, {
      organizationId: ORG, salonId: SALON, barberId: barberA, itemId, status: "LOW",
    });
    await expect(
      resolveSupplyReport(prisma, {
        organizationId: ORG,
        salonIds: ["salon_does_not_exist"],
        reportId: open.report.id,
        decision: "RESTOCKED",
        actorUserId: adminUserId,
        actorType: "SUPERVISOR",
      }),
    ).rejects.toThrow("البلاغ غير موجود");
  }, 30000);
});
