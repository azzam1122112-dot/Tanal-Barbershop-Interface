import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  getBarberRescheduleOptions,
  rescheduleBarberAppointment,
} from "../lib/appointments/barber-reschedule";
import { addRiyadhDays, riyadhDateTimeForDay, toRiyadhDateKey } from "../lib/datetime/riyadh";

const prisma = new PrismaClient();
const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
let organizationId = "";
let salonId = "";
let barberId = "";
let appointmentId = "";
let oldStart = new Date();
let blockedStart = new Date();
let newStart = new Date();

describe("barber appointment rescheduling", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        name: `مؤسسة تغيير موعد ${suffix}`,
        slug: `reschedule-${suffix}`,
        status: "ACTIVE",
        subscriptionStatus: "ACTIVE",
      },
    });
    organizationId = organization.id;

    const salon = await prisma.salon.create({
      data: { organizationId, name: "فرع الاختبار", slug: "main" },
    });
    salonId = salon.id;

    const barber = await prisma.barber.create({
      data: {
        organizationId,
        salonId,
        name: "حلاق الاختبار",
        phone: `05${Math.floor(10000000 + Math.random() * 89999999)}`,
        accessPinHash: "test-only-hash",
      },
    });
    barberId = barber.id;

    await prisma.systemSettings.create({
      data: {
        organizationId,
        salonId,
        salonName: "فرع الاختبار",
        bookingEnabled: true,
        bookingOpenMinute: 16 * 60,
        bookingCloseMinute: 23 * 60,
        bookingSlotMinutes: 30,
        bookingLeadMinutes: 120,
        bookingHorizonDays: 14,
      },
    });

    const day = addRiyadhDays(new Date(), 1);
    oldStart = riyadhDateTimeForDay(day, 18 * 60);
    blockedStart = riyadhDateTimeForDay(day, 19 * 60 + 30);
    newStart = riyadhDateTimeForDay(day, 20 * 60);

    const appointment = await prisma.appointment.create({
      data: {
        organizationId,
        salonId,
        barberId,
        customerName: "عميل تغيير الموعد",
        customerPhone: "0501234567",
        startAt: oldStart,
        durationMinutes: 60,
      },
    });
    appointmentId = appointment.id;

    await prisma.appointment.create({
      data: {
        organizationId,
        salonId,
        barberId,
        customerName: "عميل الوقت المشغول",
        customerPhone: "0507654321",
        startAt: blockedStart,
        durationMinutes: 30,
      },
    });
  });

  afterAll(async () => {
    if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("shows only valid slots while excluding the appointment being moved", async () => {
    const options = await getBarberRescheduleOptions(prisma, scope());
    const day = options.days.find((item) => item.date === toRiyadhDateKey(oldStart));

    expect(day?.slots.find((slot) => slot.minuteOfDay === 18 * 60)?.status).toBe("AVAILABLE");
    // مدة الموعد ساعة؛ لذلك 19:00 يتداخل مع حجز 19:30.
    expect(day?.slots.find((slot) => slot.minuteOfDay === 19 * 60)?.status).toBe("BOOKED");
    expect(day?.slots.find((slot) => slot.minuteOfDay === 20 * 60)?.status).toBe("AVAILABLE");
  });

  it("moves the appointment atomically and records the barber actor", async () => {
    const changed = await rescheduleBarberAppointment(prisma, {
      ...scope(),
      startAt: newStart.toISOString(),
    });

    expect(changed.startAt).toBe(newStart.toISOString());
    expect(changed.status).toBe("BOOKED");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: appointmentId, action: "appointment.rescheduled" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit.actorType).toBe("BARBER");
    expect(audit.actorBarberId).toBe(barberId);
  });

  it("does not let another barber move the appointment", async () => {
    await expect(
      getBarberRescheduleOptions(prisma, { ...scope(), barberId: "another-barber" }),
    ).rejects.toThrow("غير موجود أو لم يعد قابلًا للتعديل");
  });

  it("keeps internal rescheduling available when public QR booking is disabled", async () => {
    await prisma.systemSettings.update({
      where: { salonId },
      data: { bookingEnabled: false },
    });

    const options = await getBarberRescheduleOptions(prisma, scope());
    expect(options.days.length).toBeGreaterThan(0);

    const changed = await rescheduleBarberAppointment(prisma, {
      ...scope(),
      startAt: oldStart.toISOString(),
    });
    expect(changed.startAt).toBe(oldStart.toISOString());
  });
});

function scope() {
  return { organizationId, salonId, barberId, appointmentId };
}

