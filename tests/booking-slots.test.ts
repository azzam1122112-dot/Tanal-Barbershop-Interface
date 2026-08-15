import type { PrismaClient, SystemSettings } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  bookingConfigFromSettings,
  listAvailableSlots,
  resolveBookableSlot,
  type BookingConfig,
} from "../lib/appointments/booking-slots";
import { toRiyadhDateKey } from "../lib/datetime/riyadh";

const config: BookingConfig = {
  enabled: true,
  openMinute: 16 * 60,
  closeMinute: 21 * 60,
  slotMinutes: 30,
  closedWeekdays: [],
  leadMinutes: 120,
  horizonDays: 14,
  maxActivePerCustomer: 2,
};

const inheritedBarber = {
  id: "barber-inherited",
  workScheduleEnabled: false,
  workStartMinute: 16 * 60,
  workEndMinute: 23 * 60,
  workClosedWeekdays: [],
};

const customBarber = {
  id: "barber-custom",
  workScheduleEnabled: true,
  workStartMinute: 17 * 60,
  workEndMinute: 20 * 60,
  workClosedWeekdays: [],
};

describe("customer booking availability", () => {
  it("enforces a two-hour lead even if an older setting is lower", () => {
    const settings = {
      bookingEnabled: true,
      bookingOpenMinute: 16 * 60,
      bookingCloseMinute: 21 * 60,
      bookingSlotMinutes: 30,
      bookingClosedWeekdays: [],
      bookingLeadMinutes: 30,
      bookingHorizonDays: 14,
      bookingMaxActivePerCustomer: 2,
    } as Pick<
      SystemSettings,
      | "bookingEnabled"
      | "bookingOpenMinute"
      | "bookingCloseMinute"
      | "bookingSlotMinutes"
      | "bookingClosedWeekdays"
      | "bookingLeadMinutes"
      | "bookingHorizonDays"
      | "bookingMaxActivePerCustomer"
    >;

    expect(bookingConfigFromSettings(settings).leadMinutes).toBe(120);
  });

  it("shows booked and too-soon times while respecting each barber schedule", async () => {
    // الثواني لا تظهر للعميل: 4:30:45 يجب أن تسمح بفترة 6:30 بالضبط.
    const now = new Date("2026-08-10T13:30:45.000Z"); // 4:30:45 م في الرياض
    const bookedAt = new Date("2026-08-10T16:00:00.000Z"); // 7:00 م في الرياض
    const prisma = mockPrisma({
      barbers: [inheritedBarber, customBarber],
      appointments: [
        { barberId: inheritedBarber.id, startAt: bookedAt, durationMinutes: 30 },
        { barberId: customBarber.id, startAt: bookedAt, durationMinutes: 30 },
      ],
    });

    const days = await listAvailableSlots(prisma, {
      organizationId: "org",
      salonId: "salon",
      config,
      from: now,
      days: 1,
    });
    const today = days.find((day) => day.date === toRiyadhDateKey(now));
    expect(today).toBeDefined();

    const tooSoon = today?.slots.find((slot) => slot.minuteOfDay === 16 * 60 + 30);
    expect(tooSoon?.status).toBe("TOO_SOON");
    expect(tooSoon?.barbers).toContainEqual({ barberId: customBarber.id, status: "OFF_DUTY" });

    const firstAllowed = today?.slots.find((slot) => slot.minuteOfDay === 18 * 60 + 30);
    expect(firstAllowed?.status).toBe("AVAILABLE");

    const booked = today?.slots.find((slot) => slot.minuteOfDay === 19 * 60);
    expect(booked?.status).toBe("BOOKED");
    expect(booked?.barbers.every((barber) => barber.status === "BOOKED")).toBe(true);
  });

  it("rejects a chosen time outside the selected barber's duty", async () => {
    const now = new Date("2026-08-10T09:00:00.000Z"); // 12:00 م في الرياض
    const prisma = mockPrisma({ barbers: [customBarber], appointments: [] });

    await expect(
      resolveBookableSlot(prisma, {
        organizationId: "org",
        salonId: "salon",
        barberId: customBarber.id,
        startAt: new Date("2026-08-10T13:30:00.000Z"), // 4:30 م في الرياض
        config,
        now,
      }),
    ).rejects.toThrow("خارج دوام الحلاق");
  });

  it("rejects an occupied slot for the selected barber", async () => {
    const now = new Date("2026-08-10T09:00:00.000Z");
    const startAt = new Date("2026-08-10T15:30:00.000Z"); // 6:30 م في الرياض
    const prisma = mockPrisma({
      barbers: [customBarber],
      appointments: [{ barberId: customBarber.id, startAt, durationMinutes: 30 }],
    });

    await expect(
      resolveBookableSlot(prisma, {
        organizationId: "org",
        salonId: "salon",
        barberId: customBarber.id,
        startAt,
        config,
        now,
      }),
    ).rejects.toThrow("حُجزت للتو");
  });
});

function mockPrisma(input: {
  barbers: (typeof inheritedBarber)[];
  appointments: { barberId: string; startAt: Date; durationMinutes: number }[];
}) {
  return {
    barber: { findMany: async () => input.barbers },
    appointment: { findMany: async () => input.appointments },
  } as unknown as PrismaClient;
}
