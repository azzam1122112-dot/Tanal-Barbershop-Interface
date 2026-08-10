import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { updateDataSubjectRequest } from "../lib/privacy/execute-data-subject-request";

const prisma = new PrismaClient();
const organizationId = "org_default";
const createdRequestIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdAppointmentIds: string[] = [];
let actorUserId = "";
let actorType: "OWNER" | "ADMIN" | "SUPERVISOR" = "OWNER";
let salonId = "";

function phone(suffix: number) {
  return `05${String((Date.now() + suffix) % 100_000_000).padStart(8, "0")}`;
}

describe("التنفيذ الفعلي لطلبات الخصوصية", () => {
  beforeAll(async () => {
    const [actor, salon] = await Promise.all([
      prisma.user.findFirstOrThrow({ where: { organizationId, role: { in: ["OWNER", "ADMIN"] }, isActive: true } }),
      prisma.salon.findFirstOrThrow({ where: { organizationId } }),
    ]);
    actorUserId = actor.id;
    actorType = actor.role === "OWNER" ? "OWNER" : "ADMIN";
    salonId = salon.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdRequestIds } } });
    await prisma.dataSubjectRequest.deleteMany({ where: { id: { in: createdRequestIds } } });
    await prisma.appointment.deleteMany({ where: { id: { in: createdAppointmentIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    await prisma.$disconnect();
  });

  it("يطبق التصحيح على العميل ونسخ بيانات مواعيده", async () => {
    const originalPhone = phone(1);
    const correctedPhone = phone(2);
    const customer = await prisma.customer.create({ data: { organizationId, name: "اسم قديم", phone: originalPhone } });
    createdCustomerIds.push(customer.id);
    const appointment = await prisma.appointment.create({
      data: { organizationId, salonId, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, startAt: new Date(Date.now() + 86_400_000) },
    });
    createdAppointmentIds.push(appointment.id);
    const request = await prisma.dataSubjectRequest.create({
      data: { organizationId, customerId: customer.id, type: "CORRECTION", requestedName: "اسم صحيح", requestedPhone: correctedPhone, identityVerifiedAt: new Date(), identityVerificationMethod: "TEST" },
    });
    createdRequestIds.push(request.id);

    await updateDataSubjectRequest(prisma, { requestId: request.id, organizationId, status: "COMPLETED", resolutionNote: "تم التصحيح", actorUserId, actorType });

    await expect(prisma.customer.findUnique({ where: { id: customer.id }, select: { name: true, phone: true } })).resolves.toEqual({ name: "اسم صحيح", phone: correctedPhone });
    await expect(prisma.appointment.findUnique({ where: { id: appointment.id }, select: { customerName: true, customerPhone: true } })).resolves.toEqual({ customerName: "اسم صحيح", customerPhone: correctedPhone });
  });

  it("يحذف سجل العميل فعليًا ويبقي إثبات الطلب والعملية المالية بلا هوية", async () => {
    const customer = await prisma.customer.create({
      data: { organizationId, name: "عميل للحذف", phone: phone(3), whatsappOptIn: true, whatsappMarketingOptIn: true, loyaltyAccount: { create: { organizationId, points: 10 } } },
    });
    createdCustomerIds.push(customer.id);
    const appointment = await prisma.appointment.create({
      data: { organizationId, salonId, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, startAt: new Date(Date.now() + 172_800_000), notes: "بيانات خاصة" },
    });
    createdAppointmentIds.push(appointment.id);
    await prisma.whatsAppMessageLog.create({ data: { organizationId, customerId: customer.id, phone: customer.phone, message: "رسالة", waUrl: "https://wa.me/test" } });
    const request = await prisma.dataSubjectRequest.create({
      data: { organizationId, customerId: customer.id, type: "DELETION", identityVerifiedAt: new Date(), identityVerificationMethod: "TEST" },
    });
    createdRequestIds.push(request.id);

    await updateDataSubjectRequest(prisma, { requestId: request.id, organizationId, status: "COMPLETED", resolutionNote: "تم الحذف النهائي", actorUserId, actorType });

    expect(await prisma.customer.findUnique({ where: { id: customer.id } })).toBeNull();
    expect(await prisma.whatsAppMessageLog.count({ where: { customerId: customer.id } })).toBe(0);
    expect(await prisma.loyaltyAccount.count({ where: { customerId: customer.id } })).toBe(0);
    expect(await prisma.dataSubjectRequest.findUnique({ where: { id: request.id }, select: { status: true, executedAt: true, customerId: true } })).toMatchObject({ status: "COMPLETED", customerId: null, executedAt: expect.any(Date) });
    expect(await prisma.appointment.findUnique({ where: { id: appointment.id }, select: { customerId: true, customerName: true, customerPhone: true, notes: true } })).toEqual({ customerId: null, customerName: "عميل محذوف", customerPhone: `deleted-${customer.id}`, notes: null });
  });
});
