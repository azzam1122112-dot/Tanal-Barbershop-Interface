import type { AuditActorType, PrismaClient } from "@prisma/client";

export async function writeAuditLog({
  prisma,
  organizationId,
  salonId,
  actorType,
  actorUserId,
  actorBarberId,
  action,
  entityType,
  entityId,
  before,
  after,
  ipAddress,
  userAgent,
}: {
  prisma: PrismaClient;
  organizationId?: string | null;
  salonId?: string | null;
  actorType: AuditActorType;
  actorUserId?: string | null;
  actorBarberId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return prisma.auditLog.create({
    data: {
      organizationId,
      salonId,
      actorType,
      actorUserId,
      actorBarberId,
      action,
      entityType,
      entityId,
      before: before === undefined ? undefined : JSON.parse(JSON.stringify(before)),
      after: after === undefined ? undefined : JSON.parse(JSON.stringify(after)),
      ipAddress,
      userAgent,
    },
  });
}
