import { describe, expect, it } from "vitest";
import {
  BARBER_APPOINTMENTS_DAYS,
  barberDayBuckets,
  barberDayOffset,
} from "../lib/appointments/barber-window";
import { addRiyadhDays, startOfRiyadhDay, toRiyadhDateKey } from "../lib/datetime/riyadh";

// منتصف نهار الرياض: بعيد عن حدّي اليوم فلا يتأرجح الاختبار مع تغيّر التوقيت.
const NOW = new Date("2026-08-11T09:00:00.000Z");

describe("نافذة حجوزات الحلاق", () => {
  it("ثلاثة أيام بعناوين اليوم وغدًا وبعد غد", () => {
    const buckets = barberDayBuckets(NOW);
    expect(buckets).toHaveLength(BARBER_APPOINTMENTS_DAYS);
    expect(buckets.map((bucket) => bucket.label)).toEqual(["اليوم", "غدًا", "بعد غد"]);
    expect(buckets[0].key).toBe(toRiyadhDateKey(startOfRiyadhDay(NOW)));
    expect(buckets[2].key).toBe(toRiyadhDateKey(addRiyadhDays(startOfRiyadhDay(NOW), 2)));
  });

  it("يضع كل موعد في يومه ويستبعد ما بعد النافذة", () => {
    const day = (offset: number, hour: number) => {
      const start = addRiyadhDays(startOfRiyadhDay(NOW), offset);
      return new Date(start.getTime() + hour * 60 * 60 * 1000);
    };

    expect(barberDayOffset(day(0, 10), NOW)).toBe(0);
    expect(barberDayOffset(day(1, 10), NOW)).toBe(1);
    expect(barberDayOffset(day(2, 10), NOW)).toBe(2);
    expect(barberDayOffset(day(3, 10), NOW)).toBe(-1);
    expect(barberDayOffset(day(-1, 10), NOW)).toBe(-1);
  });

  it("موعد قبل منتصف الليل وآخر بعده يومان مختلفان", () => {
    const beforeMidnight = new Date(addRiyadhDays(startOfRiyadhDay(NOW), 1).getTime() - 60 * 60 * 1000);
    const afterMidnight = new Date(addRiyadhDays(startOfRiyadhDay(NOW), 1).getTime() + 60 * 60 * 1000);

    expect(barberDayOffset(beforeMidnight, NOW)).toBe(0);
    expect(barberDayOffset(afterMidnight, NOW)).toBe(1);
  });
});
