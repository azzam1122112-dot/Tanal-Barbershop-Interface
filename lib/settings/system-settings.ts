import { BusinessError } from "@/lib/errors";
import type { Prisma, PrismaClient, SystemSettings, UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { MIN_BOOKING_LEAD_MINUTES } from "@/lib/appointments/booking-slots";

type SettingsPrisma = PrismaClient | Prisma.TransactionClient;

/**
 * إعدادات الفرع الفعّالة، وإلا إعدادات المؤسسة.
 *
 * **استخدمها دائمًا بدل `systemSettings.findFirst({})`** — الاستعلام بلا قيد
 * قد يعيد إعدادات مؤسسة أخرى في بيئة متعددة المستأجرين، فتُحتسب النقاط
 * أو إعدادات الحساب بقيم خاطئة.
 */
export async function getEffectiveSettings(
  prisma: SettingsPrisma,
  scope: { organizationId?: string | null; salonId?: string | null },
) {
  if (scope.salonId) {
    const salonSettings = await prisma.systemSettings.findFirst({ where: { salonId: scope.salonId } });
    if (salonSettings) return salonSettings;
  }
  if (scope.organizationId) {
    return prisma.systemSettings.findFirst({ where: { organizationId: scope.organizationId } });
  }
  return null;
}

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
    legalName: settings.legalName,
    defaultCommissionRate: Number(settings.defaultCommissionRate),
    barberExpenseLimit: Number(settings.barberExpenseLimit),
    bookingEnabled: settings.bookingEnabled,
    bookingOpenMinute: settings.bookingOpenMinute,
    bookingCloseMinute: settings.bookingCloseMinute,
    bookingSlotMinutes: settings.bookingSlotMinutes,
    bookingClosedWeekdays: settings.bookingClosedWeekdays,
    bookingLeadMinutes: settings.bookingLeadMinutes,
    bookingHorizonDays: settings.bookingHorizonDays,
    bookingMaxActivePerCustomer: settings.bookingMaxActivePerCustomer,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

export type SystemSettingsUpdate = Partial<{
  salonName: string;
  currency: string;
  pointsPerCurrencyUnit: number;
  whatsappEnabled: boolean;
  legalName: string | null;
  defaultCommissionRate: number;
  barberExpenseLimit: number;
  bookingEnabled: boolean;
  bookingOpenMinute: number;
  bookingCloseMinute: number;
  bookingSlotMinutes: number;
  bookingClosedWeekdays: number[];
  bookingLeadMinutes: number;
  bookingHorizonDays: number;
  bookingMaxActivePerCustomer: number;
}>;

export async function updateSystemSettings(prisma: PrismaClient, data: SystemSettingsUpdate, meta: SettingsMeta) {
  const before = await getEffectiveSettings(prisma, { organizationId: meta.organizationId, salonId: meta.salonId });
  if (!before) throw new BusinessError("إعدادات النظام غير موجودة");

  // نافذة الحجز تُرفض عند الحفظ لا تُقصَّ بصمت: المالك يستحق سبب الرفض،
  // وإلا حفظ إغلاقًا قبل الفتح ثم بحث عن سبب اختفاء الفترات من صفحة عميله.
  if (data.barberExpenseLimit != null && (data.barberExpenseLimit < 0 || data.barberExpenseLimit > 100000)) {
    throw new BusinessError("سقف مصروف الحلاق يجب أن يكون بين صفر و100000 ريال");
  }

  const nextBookingEnabled = data.bookingEnabled ?? before.bookingEnabled;
  if (nextBookingEnabled) {
    const openMinute = data.bookingOpenMinute ?? before.bookingOpenMinute;
    const closeMinute = data.bookingCloseMinute ?? before.bookingCloseMinute;
    const slotMinutes = data.bookingSlotMinutes ?? before.bookingSlotMinutes;
    const leadMinutes = data.bookingLeadMinutes ?? before.bookingLeadMinutes;
    if (slotMinutes < 5 || slotMinutes > 240) {
      throw new BusinessError("مدة الفترة يجب أن تكون بين 5 و240 دقيقة");
    }
    if (closeMinute - openMinute < slotMinutes) {
      throw new BusinessError("ساعات الاستقبال أقصر من فترة واحدة — وسّع النافذة أو قلّل مدة الفترة");
    }
    if (leadMinutes < MIN_BOOKING_LEAD_MINUTES) {
      throw new BusinessError("أقل مهلة للحجز هي ساعتان من الوقت الحالي");
    }
    if ((data.bookingClosedWeekdays ?? before.bookingClosedWeekdays).length >= 7) {
      throw new BusinessError("لا يمكن إغلاق أيام الأسبوع كلها مع تفعيل الحجز");
    }
  }

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
