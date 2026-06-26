import { BusinessError } from "@/lib/errors";
import type { PrismaClient, SystemSettings, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";

type SettingsMeta = {
  actorUserId: string;
  actorType: Extract<UserRole, "OWNER" | "ADMIN" | "SUPERVISOR">;
  salonId?: string | null;
  organizationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function toSafeSystemSettings(settings: SystemSettings) {
  return {
    id: settings.id,
    salonName: settings.salonName,
    currency: settings.currency,
    pointsPerCurrencyUnit: Number(settings.pointsPerCurrencyUnit),
    pointsCalculatedAfterDiscount: settings.pointsCalculatedAfterDiscount,
    allowMultipleDiscounts: settings.allowMultipleDiscounts,
    whatsappDefaultCountryCode: settings.whatsappDefaultCountryCode,
    whatsappEnabled: settings.whatsappEnabled,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export async function updateSystemSettings(
  prisma: PrismaClient,
  data: Partial<{ salonName: string; currency: string; pointsPerCurrencyUnit: number; whatsappEnabled: boolean }>,
  meta: SettingsMeta,
) {
  const before = meta.salonId
    ? await prisma.systemSettings.findFirst({ where: { salonId: meta.salonId } })
    : meta.organizationId
      ? await prisma.systemSettings.findFirst({ where: { organizationId: meta.organizationId } })
      : await prisma.systemSettings.findFirst({});
  if (!before) throw new BusinessError("إعدادات النظام غير موجودة");
  const settings = await prisma.systemSettings.update({
    where: { id: before.id },
    data,
  });
  await writeAuditLog({
    prisma,
    organizationId: meta.organizationId,
    actorType: meta.actorType,
    actorUserId: meta.actorUserId,
    action: "system_settings.updated",
    entityType: "SystemSettings",
    entityId: settings.id,
    before: toSafeSystemSettings(before),
    after: toSafeSystemSettings(settings),
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return toSafeSystemSettings(settings);
}
