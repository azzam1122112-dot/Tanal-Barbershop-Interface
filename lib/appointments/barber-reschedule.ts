import { AppointmentStatus, Prisma, type PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { assertSubscriptionActive } from "@/lib/plans/subscription-guard";
import { getEffectiveSettings } from "@/lib/settings/system-settings";
import {
  bookingConfigFromSettings,
  listAvailableSlots,
  resolveBookableSlot,
  type BookingDay,
} from "@/lib/appointments/booking-slots";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/appointments/appointment-service";

const ACTIVE_STATUSES: AppointmentStatus[] = ["BOOKED", "ARRIVED"];
const appointmentInclude = {
  barber: { select: { id: true, name: true } },
  salon: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentInclude;

type BarberAppointmentScope = {
  organizationId: string;
  salonId: string;
  barberId: string;
  appointmentId: string;
};

export async function getBarberRescheduleOptions(
  prisma: PrismaClient,
  scope: BarberAppointmentScope,
): Promise<{
  days: BookingDay[];
  leadMinutes: number;
  slotMinutes: number;
  currentStartAt: string;
}> {
  const appointment = await findActiveOwnedAppointment(prisma, scope);
  const settings = await getEffectiveSettings(prisma, {
    organizationId: scope.organizationId,
    salonId: scope.salonId,
  });
  const config = bookingConfigFromSettings(settings);
  if (!config.enabled) throw new BusinessError("الحجز الإلكتروني غير مفعّل في هذا الفرع", 409);

  const days = await listAvailableSlots(prisma, {
    organizationId: scope.organizationId,
    salonId: scope.salonId,
    barberId: scope.barberId,
    config,
    durationMinutes: appointment.durationMinutes,
    excludeAppointmentId: appointment.id,
  });

  return {
    days,
    leadMinutes: config.leadMinutes,
    slotMinutes: config.slotMinutes,
    currentStartAt: appointment.startAt.toISOString(),
  };
}

export async function rescheduleBarberAppointment(
  prisma: PrismaClient,
  input: BarberAppointmentScope & { startAt: string },
) {
  await assertSubscriptionActive(prisma, input.organizationId);
  const requestedStartAt = new Date(input.startAt);
  if (Number.isNaN(requestedStartAt.getTime())) throw new BusinessError("وقت الموعد غير صحيح");

  return runSerializableTransaction(prisma, async (tx) => {
    const appointment = await findActiveOwnedAppointment(tx, input);
    if (appointment.startAt.getTime() === requestedStartAt.getTime()) {
      throw new BusinessError("اختر وقتًا مختلفًا عن الموعد الحالي");
    }

    const settings = await getEffectiveSettings(tx, {
      organizationId: input.organizationId,
      salonId: input.salonId,
    });
    const config = bookingConfigFromSettings(settings);
    if (!config.enabled) throw new BusinessError("الحجز الإلكتروني غير مفعّل في هذا الفرع", 409);

    const slot = await resolveBookableSlot(tx, {
      organizationId: input.organizationId,
      salonId: input.salonId,
      barberId: input.barberId,
      startAt: requestedStartAt,
      config,
      durationMinutes: appointment.durationMinutes,
      excludeAppointmentId: appointment.id,
    });

    const changed = await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        startAt: slot.startAt,
        status: "BOOKED",
        cancelledAt: null,
        cancelReason: null,
      },
      include: appointmentInclude,
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        actorType: "BARBER",
        actorBarberId: input.barberId,
        action: "appointment.rescheduled",
        entityType: "Appointment",
        entityId: appointment.id,
        before: { startAt: appointment.startAt.toISOString(), status: appointment.status },
        after: { startAt: changed.startAt.toISOString(), status: changed.status },
      },
    });

    return toBarberAppointmentRow(changed);
  });
}

type ReschedulePrisma = PrismaClient | Prisma.TransactionClient;

async function findActiveOwnedAppointment(prisma: ReschedulePrisma, scope: BarberAppointmentScope) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: scope.appointmentId,
      organizationId: scope.organizationId,
      salonId: scope.salonId,
      barberId: scope.barberId,
      status: { in: ACTIVE_STATUSES },
    },
    select: {
      id: true,
      startAt: true,
      durationMinutes: true,
      status: true,
    },
  });
  if (!appointment) throw new BusinessError("الحجز غير موجود أو لم يعد قابلًا للتعديل", 404);
  return appointment;
}

function toBarberAppointmentRow(
  appointment: Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>,
) {
  return {
    id: appointment.id,
    startAt: appointment.startAt.toISOString(),
    durationMinutes: appointment.durationMinutes,
    status: appointment.status,
    statusLabel: APPOINTMENT_STATUS_LABELS[appointment.status],
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone,
    notes: appointment.notes,
  };
}

async function runSerializableTransaction<T>(
  prisma: PrismaClient,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
  throw new BusinessError("تعذر تغيير الموعد بعد عدة محاولات", 409);
}
