import { describe, expect, it } from "vitest";
import {
  addRiyadhDays,
  getRiyadhDayRange,
  getRiyadhMonthRange,
  getRiyadhMinuteOfDay,
  getRiyadhWeekday,
  isSameRiyadhDay,
  parseRiyadhDateKey,
  parseRiyadhDateTimeLocal,
  riyadhDateTimeForDay,
  startOfRiyadhDay,
  toRiyadhDateKey,
} from "../lib/datetime/riyadh";

describe("Riyadh operational dates", () => {
  it("uses the Riyadh day around UTC midnight", () => {
    const instant = new Date("2026-08-10T21:30:00.000Z");

    expect(toRiyadhDateKey(instant)).toBe("2026-08-11");
    expect(getRiyadhWeekday(instant)).toBe(2);
    expect(getRiyadhMinuteOfDay(instant)).toBe(30);
    expect(startOfRiyadhDay(instant).toISOString()).toBe("2026-08-10T21:00:00.000Z");
  });

  it("constructs branch wall-clock slots as the matching UTC instant", () => {
    const day = parseRiyadhDateKey("2026-08-11");
    const fourPm = riyadhDateTimeForDay(day, 16 * 60);

    expect(day.toISOString()).toBe("2026-08-10T21:00:00.000Z");
    expect(fourPm.toISOString()).toBe("2026-08-11T13:00:00.000Z");
    expect(getRiyadhMinuteOfDay(fourPm)).toBe(16 * 60);
  });

  it("interprets datetime-local campaign values as Riyadh wall time", () => {
    expect(parseRiyadhDateTimeLocal("2026-08-15T04:00").toISOString()).toBe("2026-08-15T01:00:00.000Z");
    expect(parseRiyadhDateTimeLocal("2026-08-29T23:00").toISOString()).toBe("2026-08-29T20:00:00.000Z");
    expect(toRiyadhDateKey(parseRiyadhDateTimeLocal("2026-08-29T23:00"))).toBe("2026-08-29");
  });

  it("adds civil Riyadh days without inheriting the host timezone", () => {
    const lateNight = new Date("2026-12-31T22:30:00.000Z");
    const nextDay = addRiyadhDays(lateNight, 1);

    expect(toRiyadhDateKey(lateNight)).toBe("2027-01-01");
    expect(nextDay.toISOString()).toBe("2027-01-01T21:00:00.000Z");
    expect(isSameRiyadhDay(lateNight, new Date("2026-12-31T21:01:00.000Z"))).toBe(true);
  });

  it("builds day and month ranges on Riyadh midnight boundaries", () => {
    const instant = new Date("2026-08-10T21:30:00.000Z");
    const day = getRiyadhDayRange(instant);
    const month = getRiyadhMonthRange(instant);

    expect(day.from.toISOString()).toBe("2026-08-10T21:00:00.000Z");
    expect(day.to.toISOString()).toBe("2026-08-11T21:00:00.000Z");
    expect(month.from.toISOString()).toBe("2026-07-31T21:00:00.000Z");
    expect(month.to.toISOString()).toBe("2026-08-31T21:00:00.000Z");
  });

  it("rejects impossible civil dates", () => {
    expect(() => parseRiyadhDateKey("2026-02-30")).toThrow("Invalid date key");
    expect(() => parseRiyadhDateTimeLocal("2026-02-30T04:00")).toThrow("Invalid Riyadh local date time");
    expect(() => parseRiyadhDateTimeLocal("2026-08-15T24:00")).toThrow("Invalid Riyadh local date time");
  });
});
