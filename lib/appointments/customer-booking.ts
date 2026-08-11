import type { Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { assertSubscriptionActive } from "@/lib/plans/subscription-guard";
import { getEffectiveSettings } from "@/lib/settings/system-settings";
import {
  bookingConfigFromSettings,
  bookingWindowLimits,
  listAvailableSlots,
  parseLocalDateKey,
  resolveBookableSlot,
  type BookingConfig,
  type BookingDay,
} from "@/lib/appointments/booking-slots";
import { sendBarberAppointmentPush } from "@/lib/push/barber-push";
import { effectiveBarberSchedule } from "@/lib/barbers/work-schedule";
import { assertCustomerBookingAllowed } from "@/lib/appointments/booking-discipline";
import { dayOverlapWindow } from "@/lib/appointments/overlap-window";
import {
  appointmentServiceRows,
  appointmentServicesInclude,
  resolveAppointmentServices,
  toAppointmentServiceRows,
  type AppointmentServiceRow,
} from "@/lib/appointments/appointment-duration";
import { onlyActiveServices } from "@/lib/services/service-summary";

/**
 * الحجز الذاتي من بوابة العميل.
 *
 * طبقة تحقّق مستقلة فوق `createAppointment` عمدًا: حجز الموظف يبقى بلا قيود
 * (يحجز متى شاء ولو خارج الدوام)، بينما حجز العميل محكوم بساعات العمل
 * والمهلة الدنيا وحد المواعيد القائمة. دمج المنطقين كان سيقيّد الموظف بلا داعٍ.
 *
 * **الهوية هنا رمز البوابة لا جلسة**، فكل دالة تستقبل `customerId` مُحلًّا مسبقًا
 * من الرمز، وتُعيد قيد المؤسسة في كل استعلام حتى لا يتسرّب مستأجر لآخر.
 */

type BookingPrisma = PrismaClient;

/** أقصى عدد فروع يفحصها العرض — حارس ضد مؤسسة بعشرات الفروع. */
const MAX_BOOKABLE_SALONS = 20;

export type BookableBarber = {
  id: string;
  name: string;
  openMinute: number;
  closeMinute: number;
  closedWeekdays: number[];
  inheritsSalonSchedule: boolean;
};

/** خدمة معروضة للاختيار وقت الحجز — بمدتها وسعرها الإرشادي. */
export type BookableService = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
};

export type BookableSalon = {
  id: string;
  name: string;
  slotMinutes: number;
  horizonDays: number;
  closedWeekdays: number[];
  barbers: BookableBarber[];
  services: BookableService[];
};

export type CustomerAppointmentRow = {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: string;
  statusLabel: string;
  salonName: string;
  barberName: string | null;
  services: AppointmentServiceRow[];
  /** يُلغى من البوابة فقط ما لم يبدأ بعد وما زال محجوزًا. */
  canCancel: boolean;
};

/** الفروع التي فعّلت الحجز الذاتي ولديها حلاق نشط. */
export async function listBookableSalons(
  prisma: BookingPrisma,
  organizationId: string,
): Promise<BookableSalon[]> {
  const salons = await prisma.salon.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: MAX_BOOKABLE_SALONS,
  });

  const bookable: BookableSalon[] = [];
  for (const salon of salons) {
    const config = await getSalonBookingConfig(prisma, organizationId, salon.id);
    if (!config.enabled) continue;

    const barbers = await prisma.barber.findMany({
      where: { organizationId, salonId: salon.id, isActive: true },
      select: {
        id: true,
        name: true,
        workScheduleEnabled: true,
        workStartMinute: true,
        workEndMinute: true,
        workClosedWeekdays: true,
      },
      orderBy: { name: "asc" },
    });
    if (barbers.length === 0) continue;

    const services = await prisma.service.findMany({
      where: { organizationId, salonId: salon.id, isActive: true },
      select: { id: true, name: true, durationMinutes: true, defaultPrice: true, sortOrder: true },
    });

    bookable.push({
      id: salon.id,
      name: salon.name,
      slotMinutes: config.slotMinutes,
      horizonDays: config.horizonDays,
      closedWeekdays: config.closedWeekdays,
      // الترتيب نفسه المعتمد في بقية الشاشات، فلا تختلف قائمة الخدمات بين مكان وآخر.
      services: onlyActiveServices(services.map((service) => ({ ...service, isActive: true }))).map(
        (service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          price: Number(service.defaultPrice),
        }),
      ),
      barbers: barbers.map((barber) => {
        const schedule = effectiveBarberSchedule(config, barber);
        return {
          id: barber.id,
          name: barber.name,
          openMinute: schedule.openMinute,
          closeMinute: schedule.closeMinute,
          closedWeekdays: schedule.closedWeekdays,
          inheritsSalonSchedule: schedule.inherited,
        };
      }),
    });
  }

  return bookable;
}

export async function getSalonBookingConfig(
  prisma: BookingPrisma | Prisma.TransactionClient,
  organizationId: string,
  salonId: string,
): Promise<BookingConfig> {
  const settings = await getEffectiveSettings(prisma, { organizationId, salonId });
  return bookingConfigFromSettings(settings);
}

/** يتأكد أن الفرع تابع للمؤسسة ونشط — قبل أي استخدام لمعرّف قادم من العميل. */
async function assertSalonInOrganization(prisma: BookingPrisma, organizationId: string, salonId: string) {
  const salon = await prisma.salon.findFirst({
    where: { id: salonId, organizationId, isActive: true },
    select: { id: true },
  });
  if (!salon) throw new BusinessError("الفرع غير متاح", 404);
}

/** يتأكد أن الحلاق يعمل في هذا الفرع تحديدًا. */
async function assertBarberInSalon(
  prisma: BookingPrisma,
  organizationId: string,
  salonId: string,
  barberId: string,
) {
  const barber = await prisma.barber.findFirst({
    where: { id: barberId, organizationId, salonId, isActive: true },
    select: { id: true },
  });
  if (!barber) throw new BusinessError("الحلاق غير متاح في هذا الفرع", 404);
}

export async function getCustomerBookingSlots(
  prisma: BookingPrisma,
  input: {
    organizationId: string;
    salonId: string;
    barberId?: string | null;
    serviceIds?: string[];
    days?: number;
  },
): Promise<{
  days: BookingDay[];
  slotMinutes: number;
  leadMinutes: number;
  durationMinutes: number;
  serviceMinutes: number;
  estimatedTotal: number;
  window: ReturnType<typeof bookingWindowLimits>;
}> {
  await assertSalonInOrganization(prisma, input.organizationId, input.salonId);
  if (input.barberId) {
    await assertBarberInSalon(prisma, input.organizationId, input.salonId, input.barberId);
  }

  const config = await getSalonBookingConfig(prisma, input.organizationId, input.salonId);
  if (!config.enabled) throw new BusinessError("الحجز الذاتي غير مفعّل في هذا الفرع", 409);

  // نفس دالة الاشتقاق التي يستدعيها الحجز: شبكةٌ حُسبت بمدة تخالف المحجوزة
  // تعرض على العميل وقتًا يُرفض عند الضغط.
  const resolved = await resolveAppointmentServices(prisma, {
    organizationId: input.organizationId,
    salonId: input.salonId,
    serviceIds: input.serviceIds ?? [],
    slotMinutes: config.slotMinutes,
  });
  const durationMinutes = resolved?.bookedMinutes ?? config.slotMinutes;

  const days = await listAvailableSlots(prisma, {
    organizationId: input.organizationId,
    salonId: input.salonId,
    barberId: input.barberId ?? null,
    config,
    durationMinutes,
    days: input.days,
  });

  return {
    days,
    slotMinutes: config.slotMinutes,
    leadMinutes: config.leadMinutes,
    durationMinutes,
    serviceMinutes: resolved?.serviceMinutes ?? 0,
    estimatedTotal: resolved?.estimatedTotal ?? 0,
    // حدود النافذة تُرسل مع الشبكة لتشرح الواجهة سبب اختفاء الأوقات المتأخرة.
    window: bookingWindowLimits(config, durationMinutes),
  };
}

export async function bookCustomerAppointment(
  prisma: BookingPrisma,
  input: {
    organizationId: string;
    customerId: string;
    salonId: string;
    barberId?: string | null;
    startAt: string;
    serviceIds?: string[];
    notes?: string | null;
    ipAddress?: string | null;
  },
) {
  // اشتراك منتهٍ يوقف التشغيل — والحجز التزام تشغيلي مستقبلي لا قراءة.
  await assertSubscriptionActive(prisma, input.organizationId);
  await assertSalonInOrganization(prisma, input.organizationId, input.salonId);
  if (input.barberId) {
    await assertBarberInSalon(prisma, input.organizationId, input.salonId, input.barberId);
  }

  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, organizationId: input.organizationId },
    select: {
      id: true,
      name: true,
      phone: true,
      bookingNoShowCount: true,
      bookingBlockedAt: true,
      bookingBlockReason: true,
    },
  });
  if (!customer) throw new BusinessError("العميل غير موجود", 404);
  assertCustomerBookingAllowed(customer);

  const config = await getSalonBookingConfig(prisma, input.organizationId, input.salonId);
  if (!config.enabled) throw new BusinessError("الحجز الذاتي غير مفعّل في هذا الفرع", 409);

  const activeCount = await prisma.appointment.count({
    where: {
      organizationId: input.organizationId,
      customerId: customer.id,
      status: { in: ["BOOKED", "ARRIVED"] },
      startAt: { gte: new Date() },
    },
  });
  if (activeCount >= config.maxActivePerCustomer) {
    throw new BusinessError(
      `لديك ${activeCount} موعد قائم. ألغِ موعدًا قبل حجز موعد جديد.`,
      409,
    );
  }

  // المدة من الكتالوج لا من الطلب: رقمٌ يرسله العميل يسرق جدول الحلاق.
  const resolved = await resolveAppointmentServices(prisma, {
    organizationId: input.organizationId,
    salonId: input.salonId,
    serviceIds: input.serviceIds ?? [],
    slotMinutes: config.slotMinutes,
  });

  const startAt = new Date(input.startAt);
  const slot = await resolveBookableSlot(prisma, {
    organizationId: input.organizationId,
    salonId: input.salonId,
    barberId: input.barberId ?? null,
    startAt,
    config,
    durationMinutes: resolved?.bookedMinutes,
  });

  // معاملة واحدة: إعادة فحص التداخل ثم الإنشاء، فطلبان متزامنان على نفس
  // الفترة لا ينتجان حجزين. `resolveBookableSlot` أعلاه للرسالة الودّية،
  // وهذا الفحص هو الضمان الفعلي.
  const appointment = await prisma.$transaction(
    async (tx) => {
      const endAt = new Date(slot.startAt.getTime() + slot.durationMinutes * 60_000);

      const sameDay = await tx.appointment.findMany({
        where: {
          barberId: slot.barberId,
          status: { in: ["BOOKED", "ARRIVED"] },
          startAt: dayOverlapWindow(slot.startAt),
        },
        select: { startAt: true, durationMinutes: true },
      });

      const clash = sameDay.some((other) => {
        const otherStart = other.startAt.getTime();
        const otherEnd = otherStart + other.durationMinutes * 60_000;
        return slot.startAt.getTime() < otherEnd && otherStart < endAt.getTime();
      });
      if (clash) throw new BusinessError("هذه الفترة حُجزت للتو — اختر فترة أخرى", 409);

      const created = await tx.appointment.create({
        data: {
          organizationId: input.organizationId,
          salonId: input.salonId,
          barberId: slot.barberId,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          startAt: slot.startAt,
          durationMinutes: slot.durationMinutes,
          notes: input.notes?.trim() || null,
          source: "CUSTOMER",
          // السطور داخل معاملة الموعد: لا موعد بمدة تسعين دقيقة بلا ما يفسّرها.
          services: appointmentServiceRows(resolved),
        },
        include: {
          barber: { select: { name: true } },
          salon: { select: { name: true } },
          services: appointmentServicesInclude,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          salonId: input.salonId,
          // العميل ليس مستخدمًا في النظام — يُسجَّل كفاعل عميل بلا معرّف موظف.
          actorType: "CUSTOMER",
          action: "appointment.customer_booked",
          entityType: "Appointment",
          entityId: created.id,
          ipAddress: input.ipAddress ?? null,
          after: {
            startAt: slot.startAt.toISOString(),
            barberId: slot.barberId,
            customerId: customer.id,
            durationMinutes: slot.durationMinutes,
            serviceIds: resolved?.lines.map((line) => line.serviceId) ?? [],
          },
        },
      });

      return created;
    },
    { isolationLevel: "Serializable" },
  );

  // بعد نجاح المعاملة فقط: لا يصل للحلاق تنبيه عن حجز تراجع في قاعدة البيانات.
  await sendBarberAppointmentPush(prisma, {
    organizationId: input.organizationId,
    barberId: slot.barberId,
    appointmentId: appointment.id,
    customerName: customer.name,
    startAt: appointment.startAt,
  });

  return toCustomerAppointmentRow(appointment, new Date());
}

export async function cancelCustomerAppointment(
  prisma: BookingPrisma,
  input: {
    organizationId: string;
    customerId: string;
    appointmentId: string;
    ipAddress?: string | null;
  },
) {
  const appointment = await prisma.appointment.findFirst({
    // القيد بالعميل والمؤسسة معًا: رمز بوابة لا يُلغي موعد غيره.
    where: {
      id: input.appointmentId,
      organizationId: input.organizationId,
      customerId: input.customerId,
    },
    select: { id: true, status: true, startAt: true, salonId: true },
  });
  if (!appointment) throw new BusinessError("الموعد غير موجود", 404);
  if (appointment.status !== "BOOKED") {
    throw new BusinessError("لا يمكن إلغاء هذا الموعد — تواصل مع الصالون", 409);
  }
  if (appointment.startAt.getTime() <= Date.now()) {
    throw new BusinessError("مرّ وقت الموعد — تواصل مع الصالون", 409);
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: "ألغاه العميل من بوابته",
    },
    include: {
      barber: { select: { name: true } },
      salon: { select: { name: true } },
      services: appointmentServicesInclude,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      salonId: appointment.salonId,
      actorType: "CUSTOMER",
      action: "appointment.customer_cancelled",
      entityType: "Appointment",
      entityId: appointment.id,
      ipAddress: input.ipAddress ?? null,
      before: { status: appointment.status },
      after: { status: "CANCELLED" },
    },
  });

  return toCustomerAppointmentRow(updated, new Date());
}

/** مواعيد العميل القادمة + آخر المنتهية، لعرضها في البوابة. */
export async function listCustomerAppointments(
  prisma: BookingPrisma | Prisma.TransactionClient,
  input: { organizationId: string; customerId: string },
): Promise<CustomerAppointmentRow[]> {
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 1);

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      startAt: { gte: since },
    },
    include: {
      barber: { select: { name: true } },
      salon: { select: { name: true } },
      services: appointmentServicesInclude,
    },
    orderBy: { startAt: "asc" },
    take: 10,
  });

  return appointments.map((appointment) => toCustomerAppointmentRow(appointment, now));
}

const STATUS_LABELS: Record<string, string> = {
  BOOKED: "محجوز",
  ARRIVED: "وصلت",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى",
  NO_SHOW: "لم تحضر",
};

function toCustomerAppointmentRow(
  appointment: {
    id: string;
    startAt: Date;
    durationMinutes: number;
    status: string;
    barber: { name: string } | null;
    salon: { name: string } | null;
    services: Parameters<typeof toAppointmentServiceRows>[0];
  },
  now: Date,
): CustomerAppointmentRow {
  const endAt = new Date(appointment.startAt.getTime() + appointment.durationMinutes * 60_000);
  return {
    id: appointment.id,
    startAt: appointment.startAt.toISOString(),
    endAt: endAt.toISOString(),
    durationMinutes: appointment.durationMinutes,
    status: appointment.status,
    statusLabel: STATUS_LABELS[appointment.status] ?? appointment.status,
    salonName: appointment.salon?.name ?? "",
    barberName: appointment.barber?.name ?? null,
    services: toAppointmentServiceRows(appointment.services),
    canCancel: appointment.status === "BOOKED" && appointment.startAt.getTime() > now.getTime(),
  };
}

export { parseLocalDateKey };
