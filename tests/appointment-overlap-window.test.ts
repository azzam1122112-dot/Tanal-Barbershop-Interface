import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { listAvailableSlots, resolveBookableSlot, type BookingConfig } from "../lib/appointments/booking-slots";
import { MAX_APPOINTMENT_MINUTES, dayOverlapWindow, overlapWindowStart } from "../lib/appointments/overlap-window";

/**
 * موعد ممتدّ عبر منتصف الليل يجب أن يظهر عند فحص اليوم التالي.
 *
 * المحاكاة هنا **تحترم شرط `startAt`** بخلاف محاكاة `booking-slots.test.ts`:
 * محاكاة تعيد كل المواعيد مهما كان الشرط تُخفي بالضبط الخطأ المقصود اختباره —
 * كانت الشاشة ستمرّ بينما القاعدة لا تُرجع الصف أصلًا.
 */

const config: BookingConfig = {
  enabled: true,
  openMinute: 0,
  closeMinute: 24 * 60,
  slotMinutes: 30,
  closedWeekdays: [],
  leadMinutes: 120,
  horizonDays: 14,
  maxActivePerCustomer: 2,
};

const barber = {
  id: "barber-1",
  workScheduleEnabled: false,
  workStartMinute: 0,
  workEndMinute: 24 * 60,
  workClosedWeekdays: [],
};

// 11:30 م بتوقيت الرياض ليلة 10 أغسطس، بمدة ساعتين → ينتهي 1:30 ص من 11 أغسطس.
const spillingStart = new Date("2026-08-10T20:30:00.000Z");
const spilling = { barberId: barber.id, startAt: spillingStart, durationMinutes: 120 };

describe("نافذة فحص التداخل", () => {
  it("توسّع الحدّ الأدنى بمقدار أقصى مدة موعد", () => {
    const rangeStart = new Date("2026-08-11T00:00:00.000Z");
    expect(overlapWindowStart(rangeStart).getTime()).toBe(
      rangeStart.getTime() - MAX_APPOINTMENT_MINUTES * 60_000,
    );
  });

  it("نافذة اليوم تبدأ قبل بداية يوم الرياض ولا تتجاوز نهايته", () => {
    const window = dayOverlapWindow(new Date("2026-08-11T05:00:00.000Z"));
    // بداية 11 أغسطس بتوقيت الرياض = 10 أغسطس 21:00 UTC.
    const dayStart = new Date("2026-08-10T21:00:00.000Z");
    expect(window.gte.getTime()).toBe(dayStart.getTime() - MAX_APPOINTMENT_MINUTES * 60_000);
    expect(window.lt.getTime()).toBe(dayStart.getTime() + 24 * 60 * 60_000);
  });

  it("لا تعرض فترة متاحة يغطّيها موعد طويل بدأ أمس", async () => {
    // موعد 8:00 م بمدة ٨ ساعات ينتهي 4:00 ص من الغد. نقف عند 12:05 ص:
    // بداية «اليوم» تسبق الموعد بأربع ساعات، فبلا توسيع لا يُجلب أصلًا.
    // والمهلة (ساعتان) تُبقي 3:00 ص في المستقبل، فالخانة تُعرض ويجب أن تُقفل.
    const longStart = new Date("2026-08-10T17:00:00.000Z"); // 8:00 م الرياض
    const now = new Date("2026-08-10T21:05:00.000Z"); // 12:05 ص الرياض من الغد
    const prisma = mockPrisma([{ barberId: barber.id, startAt: longStart, durationMinutes: 480 }]);

    const days = await listAvailableSlots(prisma, {
      organizationId: "org",
      salonId: "salon",
      config,
      from: now,
      days: 1,
    });

    // 3:00 ص يقع داخل [8:00 م، 4:00 ص) — لا يجوز عرضه متاحًا.
    expect(days[0]?.slots.find((slot) => slot.minuteOfDay === 3 * 60)?.status).toBe("BOOKED");
    // 4:00 ص أول لحظة بعد نهايته.
    expect(days[0]?.slots.find((slot) => slot.minuteOfDay === 4 * 60)?.status).toBe("AVAILABLE");
  });

  it("ترفض حجز فترة يغطّيها موعد ممتدّ من اليوم السابق", async () => {
    const prisma = mockPrisma([spilling]);

    await expect(
      resolveBookableSlot(prisma, {
        organizationId: "org",
        salonId: "salon",
        barberId: barber.id,
        startAt: new Date("2026-08-10T22:00:00.000Z"), // 1:00 ص في الرياض
        config,
        now: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).rejects.toThrow("حُجزت للتو");
  });
});

/** محاكاة تُطبّق شرط `startAt` كما تفعل القاعدة — وإلا لَما اختبرنا شيئًا. */
function mockPrisma(appointments: { barberId: string; startAt: Date; durationMinutes: number }[]) {
  return {
    barber: { findMany: async () => [barber] },
    appointment: {
      findMany: async ({ where }: { where: { startAt: { gte: Date; lt: Date } } }) =>
        appointments.filter(
          (appointment) =>
            appointment.startAt.getTime() >= where.startAt.gte.getTime() &&
            appointment.startAt.getTime() < where.startAt.lt.getTime(),
        ),
    },
  } as unknown as PrismaClient;
}
