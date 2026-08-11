import type { Barber } from "@prisma/client";
import { BusinessError } from "@/lib/errors";

const MINUTES_IN_DAY = 24 * 60;

export type BarberWorkScheduleFields = Pick<
  Barber,
  "workScheduleEnabled" | "workStartMinute" | "workEndMinute" | "workClosedWeekdays"
>;

export type EffectiveBarberSchedule = {
  enabled: boolean;
  inherited: boolean;
  openMinute: number;
  closeMinute: number;
  closedWeekdays: number[];
};

/** نافذة حجز الفرع كما تُقرأ من إعداداته — القيد الذي يعيش داخله دوام الحلاق. */
export type SalonBookingWindow = {
  openMinute: number;
  closeMinute: number;
  slotMinutes: number;
  closedWeekdays: number[];
};

/** `990` → «4:30 م» — تسمية واحدة للدقيقة في كل الشاشات والرسائل. */
export function formatWorkMinute(minutes: number) {
  if (minutes === MINUTES_IN_DAY) return "12:00 ص";
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 < 12 ? "ص" : "م";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function formatBookingWindow(window: Pick<SalonBookingWindow, "openMinute" | "closeMinute">) {
  return `${formatWorkMinute(window.openMinute)} – ${formatWorkMinute(window.closeMinute)}`;
}

/**
 * يتحقق من دوام الحلاق عند الإدارة، قبل أن يصل صف مستحيل إلى قاعدة البيانات.
 *
 * `booking` (نافذة حجز الفرع) اختيارية في التوقيع لكنها ضرورية عمليًا: الدوام
 * الفعّال تقاطعٌ مع الفرع، فدوامٌ خارج النافذة يُحفظ بنجاح ثم يظهر للعميل
 * «مكتمل» في كل يوم بلا سبب ظاهر. الرفض هنا أرحم من حلاق صامت في البوابة.
 */
export function assertValidBarberWorkSchedule(
  current: BarberWorkScheduleFields,
  patch: Partial<BarberWorkScheduleFields>,
  booking?: SalonBookingWindow | null,
) {
  const enabled = patch.workScheduleEnabled ?? current.workScheduleEnabled;
  if (!enabled) return;

  const openMinute = patch.workStartMinute ?? current.workStartMinute;
  const closeMinute = patch.workEndMinute ?? current.workEndMinute;
  const closedWeekdays = patch.workClosedWeekdays ?? current.workClosedWeekdays;

  if (!Number.isInteger(openMinute) || openMinute < 0 || openMinute >= MINUTES_IN_DAY) {
    throw new BusinessError("بداية دوام الحلاق غير صحيحة");
  }
  if (!Number.isInteger(closeMinute) || closeMinute <= 0 || closeMinute > MINUTES_IN_DAY) {
    throw new BusinessError("نهاية دوام الحلاق غير صحيحة");
  }
  if (closeMinute <= openMinute) {
    throw new BusinessError("نهاية دوام الحلاق يجب أن تكون بعد بدايته");
  }
  if ([...new Set(closedWeekdays)].filter((day) => day >= 0 && day <= 6).length >= 7) {
    throw new BusinessError("لا يمكن جعل الحلاق في إجازة طوال أيام الأسبوع");
  }

  if (!booking) return;
  // نافذة فرع مكسورة أصلًا لا يُحاسَب عليها الحلاق — تُصلَح من إعدادات الفرع.
  if (booking.closeMinute - booking.openMinute < booking.slotMinutes) return;

  const effective = effectiveBarberSchedule(
    { enabled: true, ...booking },
    {
      workScheduleEnabled: true,
      workStartMinute: openMinute,
      workEndMinute: closeMinute,
      workClosedWeekdays: closedWeekdays,
    },
  );

  if (!effective.enabled) {
    throw new BusinessError(
      `دوام الحلاق خارج نافذة حجز الفرع (${formatBookingWindow(booking)}). لن يظهر للعميل أي وقت متاح لدى هذا الحلاق. اجعل الدوام داخل النافذة، أو وسّع «استقبال الحجز» من إعدادات الفرع.`,
    );
  }
  if (effective.closedWeekdays.length >= 7) {
    throw new BusinessError(
      "إجازات الحلاق مع إجازات الفرع تغطي الأسبوع كاملًا — لن يبقى يوم قابل للحجز.",
    );
  }
}

/**
 * الدوام الفعّال هو تقاطع دوام الحلاق مع نافذة حجز الفرع؛ لا يستطيع حلاق
 * فتح موعد والفرع نفسه مغلق. عند عدم التخصيص يرث الحلاق الفرع حرفيًا.
 */
export function effectiveBarberSchedule(
  salon: {
    enabled: boolean;
    openMinute: number;
    closeMinute: number;
    closedWeekdays: number[];
    slotMinutes: number;
  },
  barber: BarberWorkScheduleFields,
): EffectiveBarberSchedule {
  const inherited = !barber.workScheduleEnabled;
  const openMinute = inherited ? salon.openMinute : Math.max(salon.openMinute, barber.workStartMinute);
  const rawCloseMinute = inherited ? salon.closeMinute : Math.min(salon.closeMinute, barber.workEndMinute);
  // دوام منفصل تمامًا عن نافذة الفرع يعطي تقاطعًا مقلوبًا؛ نصفّره حتى لا تُعرض
  // نافذة مستحيلة مثل «4:00 م – 2:00 م» في أي شاشة.
  const closeMinute = Math.max(openMinute, rawCloseMinute);
  const closedWeekdays = inherited
    ? salon.closedWeekdays
    : [...new Set([...salon.closedWeekdays, ...barber.workClosedWeekdays])].sort((a, b) => a - b);

  return {
    enabled: salon.enabled && closeMinute - openMinute >= salon.slotMinutes,
    inherited,
    openMinute,
    closeMinute,
    closedWeekdays,
  };
}
