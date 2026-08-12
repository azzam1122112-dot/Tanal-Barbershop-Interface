import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createStockReport, listStockReports, resolveStockReport } from "../lib/products/stock-report-service";

/**
 * بلاغ الحلاق لا يخصم شيئًا حتى تعتمده الإدارة، والاعتماد ينشئ حركة موثقة.
 */

const prisma = new PrismaClient();
const ORG = "org_default";
const SALON = "salon_default";
let barberId = "";
let adminUserId = "";
let productId = "";
const reportIds: string[] = [];

describe("بلاغات مخزون الفرع", () => {
  beforeAll(async () => {
    const barber = await prisma.barber.findFirstOrThrow({
      where: { organizationId: ORG, salonId: SALON, isActive: true },
      select: { id: true },
    });
    barberId = barber.id;
    adminUserId = (await prisma.user.findFirstOrThrow({ where: { role: "ADMIN", isActive: true } })).id;

    const product = await prisma.product.create({
      data: {
        organizationId: ORG,
        salonId: SALON,
        name: `منتج بلاغات ${Date.now()}`,
        price: 40,
        stockQuantity: 10,
        lowStockThreshold: 3,
        isActive: true,
      },
    });
    productId = product.id;
  }, 60000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: reportIds } } });
    await prisma.stockReport.deleteMany({ where: { productId } });
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.$disconnect();
  }, 60000);

  it("البلاغ لا يمسّ الكمية", async () => {
    const report = await createStockReport(prisma, {
      organizationId: ORG,
      salonId: SALON,
      barberId,
      productId,
      type: "DAMAGED",
      quantity: 2,
      note: "عبوة مكسورة",
    });
    reportIds.push(report.id);

    expect(report.status).toBe("OPEN");
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.stockQuantity).toBe(10);
  }, 30000);

  it("لا يقبل كمية أكبر من المسجَّل ولا كمية صفرية", async () => {
    await expect(
      createStockReport(prisma, {
        organizationId: ORG, salonId: SALON, barberId, productId, type: "MISSING", quantity: 99,
      }),
    ).rejects.toThrow(/الكمية المسجَّلة/);

    await expect(
      createStockReport(prisma, {
        organizationId: ORG, salonId: SALON, barberId, productId, type: "MISSING", quantity: 0,
      }),
    ).rejects.toThrow("اكتب الكمية المبلَّغ عنها");
  }, 30000);

  it("لا يكرّر بلاغًا مفتوحًا لنفس المنتج والنوع", async () => {
    const again = await createStockReport(prisma, {
      organizationId: ORG, salonId: SALON, barberId, productId, type: "DAMAGED", quantity: 5,
    });
    expect(again.id).toBe(reportIds[0]);
    expect(again.quantity).toBe(2);
  }, 30000);

  it("الاعتماد يخصم الكمية بحركة تالف مرتبطة بالبلاغ", async () => {
    const resolved = await resolveStockReport(prisma, {
      organizationId: ORG,
      reportId: reportIds[0],
      decision: "APPROVE",
      actorUserId: adminUserId,
      actorType: "ADMIN",
    });

    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.stockMovementId).toBeTruthy();

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.stockQuantity).toBe(8);

    const movement = await prisma.stockMovement.findUniqueOrThrow({
      where: { id: resolved.stockMovementId! },
    });
    expect(movement.type).toBe("WASTE");
    expect(movement.quantity).toBe(-2);
    expect(movement.balanceAfter).toBe(8);
  }, 30000);

  it("لا يُعالج البلاغ مرتين", async () => {
    await expect(
      resolveStockReport(prisma, {
        organizationId: ORG, reportId: reportIds[0], decision: "DISMISS",
        actorUserId: adminUserId, actorType: "ADMIN",
      }),
    ).rejects.toThrow("تمّت معالجة هذا البلاغ مسبقًا");
  }, 30000);

  it("«قارب على النفاد» يُعتمد بلا خصم", async () => {
    const report = await createStockReport(prisma, {
      organizationId: ORG, salonId: SALON, barberId, productId, type: "LOW_STOCK",
    });
    reportIds.push(report.id);
    expect(report.quantity).toBeNull();

    const resolved = await resolveStockReport(prisma, {
      organizationId: ORG, reportId: report.id, decision: "APPROVE",
      actorUserId: adminUserId, actorType: "ADMIN",
    });
    expect(resolved.stockMovementId).toBeNull();

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.stockQuantity).toBe(8);
  }, 30000);

  it("لا يُرى بلاغ خارج نطاق فروع المستخدم", async () => {
    const outside = await listStockReports(prisma, {
      organizationId: ORG,
      salonIds: ["salon_does_not_exist"],
    });
    expect(outside).toHaveLength(0);

    await expect(
      resolveStockReport(prisma, {
        organizationId: ORG,
        salonIds: ["salon_does_not_exist"],
        reportId: reportIds[0],
        decision: "DISMISS",
        actorUserId: adminUserId,
        actorType: "SUPERVISOR",
      }),
    ).rejects.toThrow("البلاغ غير موجود");
  }, 30000);
});
