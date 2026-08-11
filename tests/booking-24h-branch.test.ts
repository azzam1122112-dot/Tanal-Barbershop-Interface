import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  bookingWindowLimits,
  listAvailableSlots,
  resolveBookableSlot,
  type BookingConfig,
} from "../lib/appointments/booking-slots";
import { addRiyadhDays, getRiyadhWeekday, riyadhDateTimeForDay, startOfRiyadhDay } from "../lib/datetime/riyadh";

/**
 * الفرع الذي لا يغلق: منتصف الليل عنده لحظة عابرة لا حاجز. قبل هذا المنطق كانت
 * آخر ساعة ونصف قبل منتصف الليل ثقبًا لا يُحجز في فرع يعمل 24 ساعة.
 */

const LIMITED: BookingConfig = {
  enabled: true,
  openMinute: 16 * 60,
  closeMinute: 23 * 60,
  slotMinutes: 30,
  closedWeekdays: [],
  leadMinutes: 120,
  horizonDays: 14,
  maxActivePerCustomer: 2,
};
const CONTINUOUS: BookingConfig = { ...LIMITED, openMinute: 0, closeMinute: 24 * 60 };

const BARBER = {
  id: "barber-1",
  workScheduleEnabled: false,
  workStartMinute: 0,
  workEndMinute: 24 * 60,
  workClosedWeekdays: [] as number[],
};

/** غدًا: يتجاوز مهلة الساعتين فلا تتحوّل الفترات إلى TOO_SOON. */
const TOMORROW = addRiyadhDays(startOfRiyadhDay(new Date()), 1);

function prismaWith(barbers: (typeof BARBER)[], appointments: { barberId: string; startAt: Date; durationMinutes: number }[] = []) {
  return {
    barber: { findMany: vi.fn().mockResolvedValue(barbers) },
    appointment: { findMany: vi.fn().mockResolvedValue(appointments) },
  } as unknown as PrismaClient;
}

async function minutesFor(config: BookingConfig, durationMinutes: number) {
  const days = await listAvailableSlots(prismaWith([BARBER]), {
    organizationId: "org-1",
    salonId: "salon-1",
    barberId: BARBER.id,
    config,
    from: TOMORROW,
    days: 1,
    durationMinutes,
  });
  return (days[0]?.slots ?? []).map((slot) => slot.minuteOfDay);
}

describe("فرع يعمل 24 ساعة", () => {
  it("يعرض فترات حتى آخر دقيقة في اليوم لمدة تعبر منتصف الليل", async () => {
    const minutes = await minutesFor(CONTINUOUS, 90);
    expect(minutes[0]).toBe(0);
    expect(minutes.at(-1)).toBe(23 * 60 + 30);
    expect(minutes).toContain(23 * 60 + 30);
  });

  it("الفرع المحدود يوقف الشبكة قبل الإغلاق بمقدار المدة", async () => {
    const minutes = await minutesFor(LIMITED, 90);
    expect(minutes.at(-1)).toBe(21 * 60 + 30); // 23:00 − 90 دقيقة
    expect(minutes).not.toContain(23 * 60 + 30);
  });

  it("يقبل حجز 11:30 مساءً بمدة 90 دقيقة في فرع 24 ساعة", async () => {
    const startAt = riyadhDateTimeForDay(TOMORROW, 23 * 60 + 30);
    const slot = await resolveBookableSlot(prismaWith([BARBER]), {
      organizationId: "org-1",
      salonId: "salon-1",
      barberId: BARBER.id,
      startAt,
      config: CONTINUOUS,
      durationMinutes: 90,
    });
    expect(slot.durationMinutes).toBe(90);
  });

  it("يرفض نفس الحجز في فرع يغلق 11:00 مساءً", async () => {
    const startAt = riyadhDateTimeForDay(TOMORROW, 23 * 60 + 30);
    await expect(
      resolveBookableSlot(prismaWith([BARBER]), {
        organizationId: "org-1",
        salonId: "salon-1",
        barberId: BARBER.id,
        startAt,
        config: LIMITED,
        durationMinutes: 90,
      }),
    ).rejects.toThrow("خارج دوام الحلاق");
  });

  it("لا يمتدّ الموعد إلى يوم إغلاق أسبوعي", async () => {
    // نغلق اليوم التالي لـ TOMORROW، فيُمنع أي موعد يعبر منتصف ليلته.
    const closedWeekday = getRiyadhWeekday(addRiyadhDays(TOMORROW, 1));
    const config = { ...CONTINUOUS, closedWeekdays: [closedWeekday] };

    const minutes = await minutesFor(config, 90);
    expect(minutes).not.toContain(23 * 60 + 30);
    // ما ينتهي قبل منتصف الليل يبقى معروضًا.
    expect(minutes).toContain(22 * 60 + 30);
  });

  it("الموعد العابر يمنع حجزًا فوقه بعد منتصف الليل", async () => {
    const crossing = {
      barberId: BARBER.id,
      startAt: riyadhDateTimeForDay(TOMORROW, 23 * 60 + 30),
      durationMinutes: 90, // ينتهي 1:00 من اليوم التالي
    };
    // نطلب يومين ونفحص الثاني: فجرُه بعيد عن مهلة الساعتين فلا تُخفي TOO_SOON
    // حالةَ الحجز التي نختبرها.
    const days = await listAvailableSlots(prismaWith([BARBER], [crossing]), {
      organizationId: "org-1",
      salonId: "salon-1",
      barberId: BARBER.id,
      config: CONTINUOUS,
      from: TOMORROW,
      days: 2,
      durationMinutes: 30,
    });
    const slots = days[1]?.slots ?? [];
    const midnight = slots.find((slot) => slot.minuteOfDay === 0);
    const halfPast = slots.find((slot) => slot.minuteOfDay === 30);
    const afterEnd = slots.find((slot) => slot.minuteOfDay === 60);
    expect(midnight?.status).toBe("BOOKED");
    expect(halfPast?.status).toBe("BOOKED");
    expect(afterEnd?.status).toBe("AVAILABLE");
  });

  it("حدود النافذة تُبلَّغ للواجهة لتشرح اختفاء الأوقات", () => {
    expect(bookingWindowLimits(LIMITED, 90)).toMatchObject({
      continuous: false,
      lastStartMinute: 21 * 60 + 30,
      closeMinute: 23 * 60,
    });
    expect(bookingWindowLimits(CONTINUOUS, 90)).toMatchObject({
      continuous: true,
      lastStartMinute: 24 * 60 - 1,
    });
  });
});
