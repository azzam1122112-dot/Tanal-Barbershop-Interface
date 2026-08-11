import { addRiyadhDays, startOfRiyadhDay, toRiyadhDateKey } from "@/lib/datetime/riyadh";

/**
 * مدى الحجوزات في شاشة الحلاق: اليوم وغدًا وبعد غد.
 *
 * يومٌ واحد كان يعني أن تنبيه حجز الغد يصل الحلاق ولا يجد له أثرًا في شاشته.
 * ثلاثة أيام تكفي ليحضّر يومه والذي يليه دون أن تتحوّل الشاشة إلى تقويم.
 */
export const BARBER_APPOINTMENTS_DAYS = 3;

export type BarberDayBucket = {
  /** `YYYY-MM-DD` بتوقيت الرياض. */
  key: string;
  /** 0 = اليوم، 1 = غدًا، 2 = بعد غد. */
  offset: number;
  label: string;
};

const OFFSET_LABELS = ["اليوم", "غدًا", "بعد غد"];

/** مفاتيح أيام النافذة بترتيبها، لتجميع الحجوزات تحت عناوين واضحة. */
export function barberDayBuckets(now = new Date(), days = BARBER_APPOINTMENTS_DAYS): BarberDayBucket[] {
  const first = startOfRiyadhDay(now);
  return Array.from({ length: days }, (_, offset) => {
    const day = addRiyadhDays(first, offset);
    return {
      key: toRiyadhDateKey(day),
      offset,
      label: OFFSET_LABELS[offset] ?? dayLabel(day),
    };
  });
}

/** موقع تاريخ من اليوم: 0 اليوم، 1 غدًا… و`-1` خارج النافذة. */
export function barberDayOffset(startAt: string | Date, now = new Date(), days = BARBER_APPOINTMENTS_DAYS) {
  const key = toRiyadhDateKey(typeof startAt === "string" ? new Date(startAt) : startAt);
  return barberDayBuckets(now, days).find((bucket) => bucket.key === key)?.offset ?? -1;
}

function dayLabel(day: Date) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(day);
}
