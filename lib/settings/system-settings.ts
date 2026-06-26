import { BusinessError } from "@/lib/errors";
import type { PrismaClient, SystemSettings, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";

type SettingsMeta = {
  actorUserId: string;
  actorType: Extract<UserRole, "ADMIN" | "SUPERVISOR">;
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
  const before = await prisma.systemSettings.findUnique({ where: { singletonKey: "default" } });
  if (!before) throw new BusinessError("إعدادات النظام غير موجودة");
  const settings = await prisma.systemSettings.update({
    where: { singletonKey: "default" },
    data,
  });
  await writeAuditLog({
    prisma,
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
