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

/** يتحقق من دوام الحلاق عند الإدارة، قبل أن يصل صف مستحيل إلى قاعدة البيانات. */
export function assertValidBarberWorkSchedule(
  current: BarberWorkScheduleFields,
  patch: Partial<BarberWorkScheduleFields>,
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
  const closeMinute = inherited ? salon.closeMinute : Math.min(salon.closeMinute, barber.workEndMinute);
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
