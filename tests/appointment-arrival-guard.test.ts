import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type AppointmentStatus } from "@prisma/client";
import { listAppointments, updateAppointmentStatus } from "../lib/appointments/appointment-service";
import { addRiyadhDays, startOfRiyadhDay } from "../lib/datetime/riyadh";

/**
 * صارت شاشة الحلاق تعرض ثلاثة أيام، فصار ممكنًا أن تقع ضغطة «لم يحضر» على موعد
 * الغد — وهي مخالفة تُعلّق حجز العميل الإلكتروني بعد مرتين. الحارس في الخدمة لا
 * في الواجهة، لأن الواجهة وحدها لا تحمي مسار الـ API.
 */

const prisma = new PrismaClient();
const appointmentIds: string[] = [];
let barberId = "";

const scope = () => ({
  organizationId: "org_default",
  salonIds: ["salon_default"],
  barberId,
  allowedCurrentStatuses: ["BOOKED", "ARRIVED"] as AppointmentStatus[],
  actorBarberId: barberId,
  actorType: "BARBER" as const,
});

async function createAppointment(startAt: Date, durationMinutes = 30) {
  const appointment = await prisma.appointment.create({
    data: {
      organizationId: "org_default",
      salonId: "salon_default",
      barberId,
      customerName: "عميل حارس الحضور",
      customerPhone: `05${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
      startAt,
      durationMinutes,
      source: "STAFF",
    },
  });
  appointmentIds.push(appointment.id);
  return appointment.id;
}

describe("حارس تسجيل الحضور قبل يوم الموعد", () => {
  beforeAll(async () => {
    const barber = await prisma.barber.findFirstOrThrow({
      where: { organizationId: "org_default", salonId: "salon_default", isActive: true },
      select: { id: true },
    });
    barberId = barber.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: appointmentIds } } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    await prisma.$disconnect();
  });

  it("يرفض «حضر» و«لم يحضر» لموعد الغد", async () => {
    const tomorrow = new Date(addRiyadhDays(startOfRiyadhDay(new Date()), 1).getTime() + 18 * 60 * 60 * 1000);
    const id = await createAppointment(tomorrow);

    await expect(updateAppointmentStatus(prisma, id, "NO_SHOW", scope())).rejects.toThrow(
      "لا تُسجَّل حالة الحضور قبل يوم الموعد",
    );
    await expect(updateAppointmentStatus(prisma, id, "ARRIVED", scope())).rejects.toThrow(
      "لا تُسجَّل حالة الحضور قبل يوم الموعد",
    );

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("BOOKED");
  }, 30000);

  it("يسمح بإلغاء موعد قادم — الإلغاء قرار مسبق مشروع", async () => {
    const dayAfter = new Date(addRiyadhDays(startOfRiyadhDay(new Date()), 2).getTime() + 18 * 60 * 60 * 1000);
    const id = await createAppointment(dayAfter);

    const cancelled = await updateAppointmentStatus(prisma, id, "CANCELLED", {
      ...scope(),
      reason: "اعتذر العميل",
    });
    expect(cancelled.status).toBe("CANCELLED");
  }, 30000);

  it("موعد بدأ أمس وما زال جاريًا يبقى في قائمة اليوم", async () => {
    // 11:30 مساءً أمس + ٩٠ دقيقة = ينتهي 1:00 صباح اليوم.
    const yesterday = addRiyadhDays(startOfRiyadhDay(new Date()), -1);
    const id = await createAppointment(new Date(yesterday.getTime() + (23 * 60 + 30) * 60_000), 90);

    const listed = await listAppointments(prisma, {
      organizationId: "org_default",
      salonIds: ["salon_default"],
      barberId,
      days: 3,
    });
    expect(listed.some((appointment) => appointment.id === id)).toBe(true);
  }, 30000);

  it("موعد انتهى أمس لا يظهر في قائمة اليوم", async () => {
    const yesterday = addRiyadhDays(startOfRiyadhDay(new Date()), -1);
    const id = await createAppointment(new Date(yesterday.getTime() + 18 * 60 * 60_000), 30);

    const listed = await listAppointments(prisma, {
      organizationId: "org_default",
      salonIds: ["salon_default"],
      barberId,
      days: 3,
    });
    expect(listed.some((appointment) => appointment.id === id)).toBe(false);
  }, 30000);

  it("يسمح بتسجيل الحضور لموعد اليوم", async () => {
    const today = new Date(startOfRiyadhDay(new Date()).getTime() + 1 * 60 * 60 * 1000);
    const id = await createAppointment(today);

    const arrived = await updateAppointmentStatus(prisma, id, "ARRIVED", scope());
    expect(arrived.status).toBe("ARRIVED");
  }, 30000);
});
