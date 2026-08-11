import { describe, expect, it } from "vitest";
import {
  assertValidBarberWorkSchedule,
  effectiveBarberSchedule,
  type SalonBookingWindow,
} from "../lib/barbers/work-schedule";

const booking: SalonBookingWindow = {
  openMinute: 16 * 60,
  closeMinute: 23 * 60,
  slotMinutes: 30,
  closedWeekdays: [],
};

const salon = { ...booking, enabled: true };

const current = {
  workScheduleEnabled: false,
  workStartMinute: 16 * 60,
  workEndMinute: 23 * 60,
  workClosedWeekdays: [] as number[],
};

describe("barber work schedule", () => {
  it("rejects a custom schedule that never meets the salon booking window", () => {
    expect(() =>
      assertValidBarberWorkSchedule(
        current,
        { workScheduleEnabled: true, workStartMinute: 10 * 60, workEndMinute: 14 * 60 },
        booking,
      ),
    ).toThrowError(/نافذة حجز الفرع/);
  });

  it("rejects an overlap narrower than one slot", () => {
    expect(() =>
      assertValidBarberWorkSchedule(
        current,
        { workScheduleEnabled: true, workStartMinute: 10 * 60, workEndMinute: 16 * 60 + 15 },
        booking,
      ),
    ).toThrowError(/نافذة حجز الفرع/);
  });

  it("accepts a schedule that overlaps by at least one slot", () => {
    expect(() =>
      assertValidBarberWorkSchedule(
        current,
        { workScheduleEnabled: true, workStartMinute: 14 * 60, workEndMinute: 20 * 60 },
        booking,
      ),
    ).not.toThrow();
  });

  it("rejects when barber and salon leave days cover the whole week", () => {
    expect(() =>
      assertValidBarberWorkSchedule(
        current,
        {
          workScheduleEnabled: true,
          workStartMinute: 17 * 60,
          workEndMinute: 21 * 60,
          workClosedWeekdays: [0, 1, 2, 3],
        },
        { ...booking, closedWeekdays: [4, 5, 6] },
      ),
    ).toThrowError(/الأسبوع كاملًا/);
  });

  it("leaves inherited schedules alone", () => {
    expect(() =>
      assertValidBarberWorkSchedule(current, { workStartMinute: 8 * 60 }, booking),
    ).not.toThrow();
  });

  it("never reports an inverted effective window", () => {
    const schedule = effectiveBarberSchedule(salon, {
      workScheduleEnabled: true,
      workStartMinute: 10 * 60,
      workEndMinute: 14 * 60,
      workClosedWeekdays: [],
    });

    expect(schedule.enabled).toBe(false);
    expect(schedule.closeMinute).toBeGreaterThanOrEqual(schedule.openMinute);
  });
});
