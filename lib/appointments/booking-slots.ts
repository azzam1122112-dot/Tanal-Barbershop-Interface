import type { AppointmentStatus, Prisma, PrismaClient, SystemSettings } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { effectiveBarberSchedule } from "@/lib/barbers/work-schedule";

/**
 * حساب الفترات المتاحة للحجز الذاتي من بوابة العميل.
 *
 * **مصدر حقيقة واحد للتوافر**: تُستخدم لعرض الشبكة للعميل _و_ للتحقق قبل الإنشاء.
 * لو تفرّق المنطقان لأمكن للعميل حجز فترة لا تعرضها الشاشة (سباق أو طلب مصنوع يدويًا).
 *
 * **التوقيت**: النظام كله يعمل بالتوقيت المحلي للخادم (انظر `assertNoOverlap`)،
 * وهذه الوحدة تلتزم بنفس الاتفاق — `bookingOpenMinute` دقائق من منتصف الليل المحلي.
 */

type SlotPrisma = PrismaClient | Prisma.TransactionClient;

/** الحالات التي ما زال الموعد فيها يشغل وقتًا في الجدول. */
const ACTIVE_STATUSES: AppointmentStatus[] = ["BOOKED", "ARRIVED"];

const MINUTES_IN_DAY = 24 * 60;
export const MIN_BOOKING_LEAD_MINUTES = 120;

export type BookingConfig = {
  enabled: boolean;
  openMinute: number;
  closeMinute: number;
  slotMinutes: number;
  closedWeekdays: number[];
  leadMinutes: number;
  horizonDays: number;
  maxActivePerCustomer: number;
};

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  enabled: false,
  openMinute: 16 * 60,
  closeMinute: 23 * 60,
  slotMinutes: 30,
  closedWeekdays: [],
  leadMinutes: MIN_BOOKING_LEAD_MINUTES,
  horizonDays: 14,
  maxActivePerCustomer: 2,
};

/**
 * يقرأ إعدادات الحجز من إعدادات الفرع.
 *
 * القيم المخزّنة تُنقّى هنا لا عند العرض: صفّ قديم أو تعديل مباشر على القاعدة
 * قد يحمل قيمًا مستحيلة (إغلاق قبل الفتح، فترة بصفر دقيقة) فتُنتج حلقة لا تنتهي
 * أو شبكة فارغة بلا سبب ظاهر.
 */
export function bookingConfigFromSettings(settings: Pick<
  SystemSettings,
  | "bookingEnabled"
  | "bookingOpenMinute"
  | "bookingCloseMinute"
  | "bookingSlotMinutes"
  | "bookingClosedWeekdays"
  | "bookingLeadMinutes"
  | "bookingHorizonDays"
  | "bookingMaxActivePerCustomer"
> | null): BookingConfig {
  if (!settings) return DEFAULT_BOOKING_CONFIG;

  const slotMinutes = clamp(settings.bookingSlotMinutes, 5, 240, DEFAULT_BOOKING_CONFIG.slotMinutes);
  const openMinute = clamp(settings.bookingOpenMinute, 0, MINUTES_IN_DAY - 1, DEFAULT_BOOKING_CONFIG.openMinute);
  const closeMinute = clamp(settings.bookingCloseMinute, 0, MINUTES_IN_DAY, DEFAULT_BOOKING_CONFIG.closeMinute);

  return {
    // نافذة مقلوبة أو أضيق من فترة واحدة = لا حجز، مهما كان المفتاح.
    enabled: settings.bookingEnabled && closeMinute - openMinute >= slotMinutes,
    openMinute,
    closeMinute,
    slotMinutes,
    closedWeekdays: [...new Set(settings.bookingClosedWeekdays)].filter((day) => day >= 0 && day <= 6),
    leadMinutes: clamp(
      settings.bookingLeadMinutes,
      MIN_BOOKING_LEAD_MINUTES,
      7 * MINUTES_IN_DAY,
      DEFAULT_BOOKING_CONFIG.leadMinutes,
    ),
    horizonDays: clamp(settings.bookingHorizonDays, 1, 90, DEFAULT_BOOKING_CONFIG.horizonDays),
    maxActivePerCustomer: clamp(settings.bookingMaxActivePerCustomer, 1, 20, DEFAULT_BOOKING_CONFIG.maxActivePerCustomer),
  };
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function startOfLocalDay(value: Date) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** `YYYY-MM-DD` بالتوقيت المحلي — `toISOString` يزيح اليوم عند فروق المنطقة. */
export function toLocalDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** يحوّل `YYYY-MM-DD` إلى منتصف ليل محلي، ويرفض ما عداه. */
export function parseLocalDateKey(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new BusinessError("التاريخ غير صحيح");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) throw new BusinessError("التاريخ غير صحيح");
  return date;
}

export type BookingSlot = {
  /** بداية الفترة بصيغة ISO — تُعاد كما هي عند الحجز. */
  startAt: string;
  /** دقائق من منتصف الليل المحلي، لعرض الوقت بلا تحليل تاريخ في الواجهة. */
  minuteOfDay: number;
  /** الحالة الإجمالية: AVAILABLE إذا كان حلاق واحد على الأقل متاحًا. */
  status: BookingSlotStatus;
  /** حالة كل حلاق بلا أي بيانات عميل — لعرض المتاح والمحجوز بأمان. */
  barbers: { barberId: string; status: BookingSlotStatus }[];
};

export type BookingSlotStatus = "AVAILABLE" | "BOOKED" | "TOO_SOON" | "OFF_DUTY";

export type BookingDay = {
  /** `YYYY-MM-DD` محلي. */
  date: string;
  weekday: number;
  /** مغلق أسبوعيًا (إجازة الفرع) — يُعرض معطّلًا لا يُخفى، فيفهم العميل السبب. */
  closed: boolean;
  slots: BookingSlot[];
};

type BusyInterval = { start: number; end: number; barberId: string | null };

/**
 * جدول الفترات خلال المدى، مع حالة كل فترة: متاحة، محجوزة، قريبة، أو خارج الدوام.
 *
 * `barberId = null` تعني «أي حلاق»: الفترة متاحة إن كان **حلاق واحد على الأقل**
 * فارغًا فيها. لهذا نجلب حلاقي الفرع لا مواعيد حلاق بعينه.
 */
export async function listAvailableSlots(
  prisma: SlotPrisma,
  input: {
    organizationId: string;
    salonId: string;
    barberId?: string | null;
    config: BookingConfig;
    from?: Date;
    days?: number;
    durationMinutes?: number;
    excludeAppointmentId?: string | null;
  },
): Promise<BookingDay[]> {
  const { config } = input;
  if (!config.enabled) return [];
  const durationMinutes = validDurationMinutes(input.durationMinutes ?? config.slotMinutes);

  const now = input.from ?? new Date();
  const firstDay = startOfLocalDay(now);
  const dayCount = Math.min(input.days ?? config.horizonDays, config.horizonDays);
  const rangeEnd = new Date(firstDay);
  rangeEnd.setDate(rangeEnd.getDate() + dayCount);

  const barbers = await prisma.barber.findMany({
    where: {
      organizationId: input.organizationId,
      salonId: input.salonId,
      isActive: true,
      ...(input.barberId ? { id: input.barberId } : {}),
    },
    select: {
      id: true,
      workScheduleEnabled: true,
      workStartMinute: true,
      workEndMinute: true,
      workClosedWeekdays: true,
    },
  });
  if (barbers.length === 0) return [];
  const barberIds = barbers.map((barber) => barber.id);
  const schedules = new Map(
    barbers.map((barber) => [barber.id, effectiveBarberSchedule(config, barber)]),
  );

  const appointments = await prisma.appointment.findMany({
    where: {
      salonId: input.salonId,
      status: { in: ACTIVE_STATUSES },
      startAt: { gte: firstDay, lt: rangeEnd },
      ...(input.excludeAppointmentId ? { id: { not: input.excludeAppointmentId } } : {}),
      // موعد بلا حلاق محدَّد لا يحجز حلاقًا بعينه، فلا يُسقط فترة من الشبكة.
      barberId: { in: barberIds },
    },
    select: { barberId: true, startAt: true, durationMinutes: true },
  });

  const busy: BusyInterval[] = appointments.map((appointment) => ({
    barberId: appointment.barberId,
    start: appointment.startAt.getTime(),
    end: appointment.startAt.getTime() + appointment.durationMinutes * 60_000,
  }));

  const earliest = bookingLeadThreshold(now, config.leadMinutes);
  const days: BookingDay[] = [];

  for (let offset = 0; offset < dayCount; offset += 1) {
    const day = new Date(firstDay);
    day.setDate(day.getDate() + offset);
    const weekday = day.getDay();
    const branchClosed = config.closedWeekdays.includes(weekday);
    const slots: BookingSlot[] = [];
    const candidateMinutes = new Set<number>();

    if (!branchClosed) {
      for (const barber of barbers) {
        const schedule = schedules.get(barber.id);
        if (!schedule?.enabled || schedule.closedWeekdays.includes(weekday)) continue;
        for (
          let minute = schedule.openMinute;
          minute + durationMinutes <= schedule.closeMinute;
          minute += config.slotMinutes
        ) {
          candidateMinutes.add(minute);
        }
      }

      for (const minute of [...candidateMinutes].sort((left, right) => left - right)) {
        const start = new Date(day);
        start.setMinutes(minute, 0, 0);
        const startMs = start.getTime();
        const endMs = startMs + durationMinutes * 60_000;
        const barberStatuses = barbers.map((barber) => {
          const schedule = schedules.get(barber.id);
          let status: BookingSlotStatus;
          if (!schedule || !isBarberOnDuty(schedule, weekday, minute, durationMinutes, config.slotMinutes)) {
            status = "OFF_DUTY";
          } else if (startMs < earliest) {
            status = "TOO_SOON";
          } else if (
            busy.some((slot) => slot.barberId === barber.id && startMs < slot.end && slot.start < endMs)
          ) {
            status = "BOOKED";
          } else {
            status = "AVAILABLE";
          }
          return { barberId: barber.id, status };
        });

        slots.push({
          startAt: start.toISOString(),
          minuteOfDay: minute,
          status: combinedSlotStatus(barberStatuses.map((item) => item.status)),
          barbers: barberStatuses,
        });
      }
    }

    days.push({
      date: toLocalDateKey(day),
      weekday,
      closed: branchClosed || candidateMinutes.size === 0,
      slots,
    });
  }

  return days;
}

/**
 * يتحقق أن وقتًا بعينه فترة صالحة ومتاحة، ويعيد الحلاق الذي سيخدمه.
 *
 * يُستدعى قبل الإنشاء مباشرة: الشبكة المعروضة للعميل لقطة قديمة بطبيعتها،
 * وقد يسبقه غيره إلى الفترة بين العرض والضغط.
 */
export async function resolveBookableSlot(
  prisma: SlotPrisma,
  input: {
    organizationId: string;
    salonId: string;
    barberId?: string | null;
    startAt: Date;
    config: BookingConfig;
    now?: Date;
    durationMinutes?: number;
    excludeAppointmentId?: string | null;
  },
): Promise<{ barberId: string; startAt: Date; durationMinutes: number }> {
  const { config } = input;
  if (!config.enabled) throw new BusinessError("الحجز الذاتي غير مفعّل في هذا الفرع", 409);

  const startAt = input.startAt;
  if (Number.isNaN(startAt.getTime())) throw new BusinessError("وقت الموعد غير صحيح");

  const now = input.now ?? new Date();
  const minuteOfDay = startAt.getHours() * 60 + startAt.getMinutes();
  const durationMinutes = validDurationMinutes(input.durationMinutes ?? config.slotMinutes);

  if (startAt.getSeconds() !== 0 || startAt.getMilliseconds() !== 0) {
    throw new BusinessError("الوقت المختار ليس ضمن الفترات المتاحة");
  }
  if (config.closedWeekdays.includes(startAt.getDay())) {
    throw new BusinessError("الفرع مغلق في هذا اليوم");
  }
  if (startAt.getTime() < bookingLeadThreshold(now, config.leadMinutes)) {
    throw new BusinessError("الوقت المختار قريب جدًا — اختر فترة أبعد");
  }

  const horizonEnd = startOfLocalDay(now);
  horizonEnd.setDate(horizonEnd.getDate() + config.horizonDays);
  if (startAt.getTime() >= horizonEnd.getTime()) {
    throw new BusinessError("لا يمكن الحجز لهذا التاريخ البعيد");
  }

  const barbers = await prisma.barber.findMany({
    where: {
      organizationId: input.organizationId,
      salonId: input.salonId,
      isActive: true,
      ...(input.barberId ? { id: input.barberId } : {}),
    },
    select: {
      id: true,
      workScheduleEnabled: true,
      workStartMinute: true,
      workEndMinute: true,
      workClosedWeekdays: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (barbers.length === 0) {
    throw new BusinessError(input.barberId ? "الحلاق غير متاح" : "لا يوجد حلاق متاح في هذا الفرع", 404);
  }

  const onDutyBarbers = barbers.filter((barber) =>
    isBarberOnDuty(
      effectiveBarberSchedule(config, barber),
      startAt.getDay(),
      minuteOfDay,
      durationMinutes,
      config.slotMinutes,
    ),
  );
  if (onDutyBarbers.length === 0) {
    throw new BusinessError(
      input.barberId ? "الوقت المختار خارج دوام الحلاق" : "لا يوجد حلاق في دوامه خلال هذا الوقت",
      409,
    );
  }

  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  const sameWindow = await prisma.appointment.findMany({
    where: {
      salonId: input.salonId,
      status: { in: ACTIVE_STATUSES },
      barberId: { in: onDutyBarbers.map((barber) => barber.id) },
      ...(input.excludeAppointmentId ? { id: { not: input.excludeAppointmentId } } : {}),
      // نافذة يوم كامل حول الموعد: المدد أعمدة لا تعبير SQL، فالتداخل يُفحص حسابيًا.
      startAt: { gte: startOfLocalDay(startAt), lt: addDays(startOfLocalDay(startAt), 1) },
    },
    select: { barberId: true, startAt: true, durationMinutes: true },
  });

  const free = onDutyBarbers.find(
    (barber) =>
      !sameWindow.some((other) => {
        if (other.barberId !== barber.id) return false;
        const otherStart = other.startAt.getTime();
        const otherEnd = otherStart + other.durationMinutes * 60_000;
        return startAt.getTime() < otherEnd && otherStart < endAt.getTime();
      }),
  );

  if (!free) {
    throw new BusinessError("هذه الفترة حُجزت للتو — اختر فترة أخرى", 409);
  }

  return { barberId: free.id, startAt, durationMinutes };
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function isBarberOnDuty(
  schedule: { enabled: boolean; openMinute: number; closeMinute: number; closedWeekdays: number[] },
  weekday: number,
  minuteOfDay: number,
  durationMinutes: number,
  intervalMinutes: number,
) {
  return (
    schedule.enabled &&
    !schedule.closedWeekdays.includes(weekday) &&
    minuteOfDay >= schedule.openMinute &&
    minuteOfDay + durationMinutes <= schedule.closeMinute &&
    (minuteOfDay - schedule.openMinute) % intervalMinutes === 0
  );
}

function validDurationMinutes(value: number) {
  if (!Number.isInteger(value) || value < 5 || value > 8 * 60) {
    throw new BusinessError("مدة الحجز غير صحيحة");
  }
  return value;
}

function combinedSlotStatus(statuses: BookingSlotStatus[]): BookingSlotStatus {
  if (statuses.includes("AVAILABLE")) return "AVAILABLE";
  if (statuses.includes("BOOKED")) return "BOOKED";
  if (statuses.includes("TOO_SOON")) return "TOO_SOON";
  return "OFF_DUTY";
}

/** المهلة بدقة الدقيقة التي يراها العميل؛ 4:30:45 تعني أن 6:30 متاح بعد ساعتين. */
function bookingLeadThreshold(now: Date, leadMinutes: number) {
  const visibleNow = new Date(now);
  visibleNow.setSeconds(0, 0);
  return visibleNow.getTime() + leadMinutes * 60_000;
}
