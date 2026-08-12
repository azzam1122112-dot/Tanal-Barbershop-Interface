import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { bookCustomerAppointment, listBookableSalons } from "../lib/appointments/customer-booking";
import { addRiyadhDays, riyadhDateTimeForDay, startOfRiyadhDay } from "../lib/datetime/riyadh";

/**
 * حدّ المواعيد القائمة للعميل.
 *
 * الخادم كان يرفض بالرسالة الصحيحة، لكن الواجهة تمسحها فور وصولها فيقرأ العميل
 * الرفض كعطل. هنا نثبّت: **الرفض برسالة مفهومة**، و**وصول الحدّ إلى الواجهة**
 * لتعرضه قبل أن يختار أصلًا.
 */

const prisma = new PrismaClient();
const ORG = "org_default";
const SALON = "salon_default";
const createdAppointmentIds: string[] = [];
let customerId = "";
let barberId = "";
let previousSettings: { enabled: boolean; open: number; close: number; max: number } | null = null;

describe("حدّ المواعيد القائمة للعميل", () => {
  beforeAll(async () => {
    const settings = await prisma.systemSettings.findFirstOrThrow({ where: { organizationId: ORG } });
    previousSettings = {
      enabled: settings.bookingEnabled,
      open: settings.bookingOpenMinute,
      close: settings.bookingCloseMinute,
      max: settings.bookingMaxActivePerCustomer,
    };
    await prisma.systemSettings.update({
      where: { id: settings.id },
      data: {
        bookingEnabled: true,
        bookingOpenMinute: 0,
        bookingCloseMinute: 24 * 60,
        bookingMaxActivePerCustomer: 2,
      },
    });

    const barber = await prisma.barber.findFirstOrThrow({
      where: { organizationId: ORG, salonId: SALON, isActive: true },
      select: { id: true },
    });
    barberId = barber.id;

    const customer = await prisma.customer.create({
      data: { organizationId: ORG, name: "عميل حدّ المواعيد", phone: `9665${Math.floor(10_000_000 + Math.random() * 89_999_999)}` },
    });
    customerId = customer.id;
  }, 60000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdAppointmentIds } } });
    await prisma.appointment.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    if (previousSettings) {
      await prisma.systemSettings.updateMany({
        where: { organizationId: ORG },
        data: {
          bookingEnabled: previousSettings.enabled,
          bookingOpenMinute: previousSettings.open,
          bookingCloseMinute: previousSettings.close,
          bookingMaxActivePerCustomer: previousSettings.max,
        },
      });
    }
    await prisma.$disconnect();
  }, 60000);

  it("يبلّغ الواجهة بالحدّ مع بيانات الفرع", async () => {
    const salons = await listBookableSalons(prisma, ORG);
    const salon = salons.find((row) => row.id === SALON);
    expect(salon?.maxActivePerCustomer).toBe(2);
  }, 30000);

  it("يرفض الموعد الثالث برسالة تشرح السبب وتقترح الحل", async () => {
    const day = addRiyadhDays(startOfRiyadhDay(new Date()), 2);
    for (const hour of [10, 12]) {
      const appointment = await bookCustomerAppointment(prisma, {
        organizationId: ORG,
        customerId,
        salonId: SALON,
        barberId,
        startAt: riyadhDateTimeForDay(day, hour * 60).toISOString(),
      });
      createdAppointmentIds.push(appointment.id);
    }

    await expect(
      bookCustomerAppointment(prisma, {
        organizationId: ORG,
        customerId,
        salonId: SALON,
        barberId,
        startAt: riyadhDateTimeForDay(day, 14 * 60).toISOString(),
      }),
    ).rejects.toThrow("لديك 2 موعد قائم. ألغِ موعدًا قبل حجز موعد جديد.");
  }, 60000);

  it("إلغاء موعد يفتح المجال لحجز جديد", async () => {
    const [first] = createdAppointmentIds;
    await prisma.appointment.update({ where: { id: first }, data: { status: "CANCELLED", cancelledAt: new Date() } });

    const day = addRiyadhDays(startOfRiyadhDay(new Date()), 2);
    const created = await bookCustomerAppointment(prisma, {
      organizationId: ORG,
      customerId,
      salonId: SALON,
      barberId,
      startAt: riyadhDateTimeForDay(day, 16 * 60).toISOString(),
    });
    createdAppointmentIds.push(created.id);
    expect(created.status).toBe("BOOKED");
  }, 60000);
});
