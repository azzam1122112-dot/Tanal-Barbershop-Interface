import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  assertCustomerBookingAllowed,
  toCustomerBookingPolicy,
} from "../lib/appointments/booking-discipline";
import { updateAppointmentStatus } from "../lib/appointments/appointment-service";

const prisma = new PrismaClient();
const appointmentIds: string[] = [];
let customerId = "";

describe("two-strike booking discipline", () => {
  beforeAll(async () => {
    const barber = await prisma.barber.findFirstOrThrow({
      where: { organizationId: "org_default", salonId: "salon_default", isActive: true },
      select: { id: true },
    });
    const customer = await prisma.customer.create({
      data: {
        organizationId: "org_default",
        name: "عميل اختبار عدم الحضور",
        phone: randomSaudiPhone(),
      },
    });
    customerId = customer.id;

    for (const hoursFromNow of [24, 48]) {
      const appointment = await prisma.appointment.create({
        data: {
          organizationId: "org_default",
          salonId: "salon_default",
          barberId: barber.id,
          customerId,
          customerName: customer.name,
          customerPhone: customer.phone,
          startAt: new Date(Date.now() - hoursFromNow * 60 * 60 * 1000),
          durationMinutes: 30,
          source: "CUSTOMER",
        },
      });
      appointmentIds.push(appointment.id);
    }
  });

  it("prevents a barber from changing another barber's appointment", async () => {
    await expect(
      updateAppointmentStatus(prisma, appointmentIds[0], "ARRIVED", {
        organizationId: "org_default",
        salonIds: ["salon_default"],
        barberId: "barber_not_assigned_to_appointment",
        allowedCurrentStatuses: ["BOOKED", "ARRIVED"],
        actorBarberId: "barber_not_assigned_to_appointment",
        actorType: "BARBER",
      }),
    ).rejects.toThrow("الموعد غير موجود");

    const untouched = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentIds[0] } });
    expect(untouched.status).toBe("BOOKED");
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: appointmentIds } } });
    await prisma.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("warns after one no-show and blocks exactly after the second", async () => {
    await updateAppointmentStatus(prisma, appointmentIds[0], "NO_SHOW", scope());
    // الطلب المكرر لنفس الحالة لا يضيف مخالفة ثانية.
    await updateAppointmentStatus(prisma, appointmentIds[0], "NO_SHOW", scope());

    const afterFirst = await getCustomerDiscipline();
    expect(toCustomerBookingPolicy(afterFirst)).toMatchObject({
      noShowCount: 1,
      remainingBeforeBlock: 1,
      blocked: false,
    });
    expect(() => assertCustomerBookingAllowed(afterFirst)).not.toThrow();

    await updateAppointmentStatus(prisma, appointmentIds[1], "NO_SHOW", scope());
    const afterSecond = await getCustomerDiscipline();
    expect(toCustomerBookingPolicy(afterSecond)).toMatchObject({
      noShowCount: 2,
      remainingBeforeBlock: 0,
      blocked: true,
    });
    expect(() => assertCustomerBookingAllowed(afterSecond)).toThrow("تم تعليق الحجز الإلكتروني");
  });

  it("unblocks automatically when staff corrects a no-show", async () => {
    await updateAppointmentStatus(
      prisma,
      appointmentIds[0],
      "CANCELLED",
      { ...scope(), reason: "تصحيح حالة عدم الحضور" },
    );

    const corrected = await getCustomerDiscipline();
    expect(toCustomerBookingPolicy(corrected)).toMatchObject({
      noShowCount: 1,
      remainingBeforeBlock: 1,
      blocked: false,
    });
    expect(() => assertCustomerBookingAllowed(corrected)).not.toThrow();
  });
});

function scope() {
  return {
    organizationId: "org_default",
    salonIds: ["salon_default"],
    actorType: "ADMIN" as const,
  };
}

async function getCustomerDiscipline() {
  return prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: {
      bookingNoShowCount: true,
      bookingBlockedAt: true,
      bookingBlockReason: true,
    },
  });
}

function randomSaudiPhone() {
  return `9665${Math.floor(10000000 + Math.random() * 89999999)}`;
}
