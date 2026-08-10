import type { Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit/audit-log";

type PrivacyPrisma = PrismaClient | Prisma.TransactionClient;

export async function updateDataSubjectRequest(
  prisma: PrismaClient,
  input: {
    requestId: string;
    organizationId: string;
    status: "IN_PROGRESS" | "COMPLETED" | "REJECTED";
    resolutionNote: string;
    actorUserId: string;
    actorType: "OWNER" | "ADMIN" | "SUPERVISOR";
  },
) {
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.dataSubjectRequest.findFirst({
      where: { id: input.requestId, organizationId: input.organizationId },
      include: { customer: true },
    });
    if (!request) throw new BusinessError("الطلب غير موجود", 404);

    if (input.status === "IN_PROGRESS") {
      return tx.dataSubjectRequest.update({
        where: { id: request.id },
        data: { status: "IN_PROGRESS", resolutionNote: input.resolutionNote, resolvedAt: null },
      });
    }
    if (input.status === "REJECTED") {
      if (request.executedAt) throw new BusinessError("لا يمكن رفض طلب نُفّذ بالفعل", 409);
      return tx.dataSubjectRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", resolutionNote: input.resolutionNote, resolvedAt: new Date() },
      });
    }
    if (request.executedAt && request.status === "COMPLETED") return request;
    if (!request.identityVerifiedAt) throw new BusinessError("لا يمكن التنفيذ قبل توثيق التحقق من هوية صاحب البيانات", 409);
    if (!request.customer || !request.customerId) throw new BusinessError("بيانات صاحب الطلب محذوفة بالفعل", 409);

    const now = new Date();
    if (request.type === "CORRECTION") {
      const nextName = request.requestedName?.trim() || request.customer.name;
      const nextPhone = request.requestedPhone || request.customer.phone;
      const duplicate = await tx.customer.findFirst({
        where: { organizationId: input.organizationId, phone: nextPhone, id: { not: request.customerId } },
        select: { id: true },
      });
      if (duplicate) throw new BusinessError("الجوال الصحيح مرتبط بعميل آخر؛ راجع الطلب قبل التنفيذ", 409);
      await tx.customer.update({ where: { id: request.customerId }, data: { name: nextName, phone: nextPhone } });
      await tx.appointment.updateMany({
        where: { customerId: request.customerId, organizationId: input.organizationId },
        data: { customerName: nextName, customerPhone: nextPhone },
      });
    } else if (request.type === "WITHDRAW_CONSENT") {
      await tx.customer.update({
        where: { id: request.customerId },
        data: {
          whatsappOptIn: false,
          whatsappTransactionalOptIn: false,
          whatsappMarketingOptIn: false,
          whatsappConsentSource: null,
          whatsappOptOutAt: now,
          whatsappOptOutReason: "طلب صاحب البيانات",
        },
      });
      await tx.whatsAppMessageLog.updateMany({
        where: { customerId: request.customerId, status: { in: ["DRAFTED", "OPENED"] } },
        data: { status: "SKIPPED", skippedReason: "سحب صاحب البيانات موافقة التواصل" },
      });
    } else if (request.type === "DELETION") {
      await eraseCustomerPersonalData(tx, input.organizationId, request.customerId);
    }

    return tx.dataSubjectRequest.update({
      where: { id: request.id },
      data: {
        status: "COMPLETED",
        resolutionNote: input.resolutionNote,
        resolvedAt: now,
        executedAt: now,
        requestedName: null,
        requestedPhone: null,
        details: null,
      },
    });
  }, { isolationLevel: "Serializable" });

  await writeAuditLog({
    prisma,
    organizationId: input.organizationId,
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    action: input.status === "COMPLETED" ? "privacy.request.executed" : "privacy.request.status_updated",
    entityType: "DataSubjectRequest",
    entityId: result.id,
    after: { type: result.type, status: result.status, identityVerified: Boolean(result.identityVerifiedAt), executedAt: result.executedAt },
  });
  return result;
}

async function eraseCustomerPersonalData(tx: PrivacyPrisma, organizationId: string, customerId: string) {
  const [visits, appointments] = await Promise.all([
    tx.visit.findMany({ where: { organizationId, customerId }, select: { id: true } }),
    tx.appointment.findMany({ where: { organizationId, customerId }, select: { id: true } }),
  ]);
  const relatedEntityIds = [customerId, ...visits.map((row) => row.id), ...appointments.map((row) => row.id)];
  const anonymousName = "عميل محذوف";
  const anonymousPhone = `deleted-${customerId}`;

  await tx.whatsAppMessageLog.deleteMany({ where: { organizationId, customerId } });
  await tx.loyaltyTransaction.deleteMany({ where: { organizationId, customerId } });
  await tx.loyaltyAccount.deleteMany({ where: { organizationId, customerId } });
  await tx.campaignRedemption.deleteMany({ where: { organizationId, customerId } });
  await tx.managerReward.deleteMany({ where: { organizationId, customerId } });
  await tx.appointment.updateMany({
    where: { organizationId, customerId },
    data: { customerName: anonymousName, customerPhone: anonymousPhone, notes: null },
  });
  await tx.auditLog.deleteMany({ where: { organizationId, entityId: { in: relatedEntityIds } } });
  await tx.dataSubjectRequest.updateMany({
    where: { organizationId, customerId },
    data: { details: null, requestedName: null, requestedPhone: null, resolutionNote: null },
  });
  await tx.customer.delete({ where: { id: customerId } });
}
