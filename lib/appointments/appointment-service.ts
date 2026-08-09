import type { AppointmentStatus, Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { normalizeSaudiPhone } from "@/lib/phone/saudi-phone";
import { sendBarberAppointmentPush } from "@/lib/push/barber-push";

type AppointmentPrisma = PrismaClient | Prisma.TransactionClient;

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  BOOKED: "محجوز",
  ARRIVED: "وصل",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى",
  NO_SHOW: "لم يحضر",
};

/** الحالات التي ما زال الموعد فيها يشغل وقتًا في الجدول. */
const ACTIVE_STATUSES: AppointmentStatus[] = ["BOOKED", "ARRIVED"];

const appointmentInclude = {
  barber: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true } },
  salon: { select: { id: true, name: true } },
} satisfies Prisma.AppointmentInclude;

export type AppointmentRow = ReturnType<typeof toAppointmentRow>;

export async function createAppointment(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    salonId: string;
    barberId?: string | null;
    customerName: string;
    customerPhone: string;
    startAt: Date | string;
    durationMinutes?: number;
    notes?: string | null;
    source?: "STAFF" | "CUSTOMER";
    actorUserId?: string | null;
    actorType?: "OWNER" | "ADMIN" | "SUPERVISOR";
  },
) {
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) {
    throw new BusinessError("وقت الموعد غير صحيح");
  }
  const durationMinutes = input.durationMinutes && input.durationMinutes > 0 ? input.durationMinutes : 30;
  const phone = normalizeSaudiPhone(input.customerPhone);
  const name = input.customerName.trim();
  if (!name) throw new BusinessError("اسم العميل مطلوب");

  const salon = await prisma.salon.findFirst({
    where: { id: input.salonId, organizationId: input.organizationId, isActive: true },
    select: { id: true },
  });
  if (!salon) throw new BusinessError("الفرع غير موجود", 404);

  if (input.barberId) {
    const barber = await prisma.barber.findFirst({
      where: { id: input.barberId, organizationId: input.organizationId, salonId: input.salonId, isActive: true },
      select: { id: true },
    });
    if (!barber) throw new BusinessError("الحلاق غير موجود في هذا الفرع", 404);
    await assertNoOverlap(prisma, { barberId: input.barberId, startAt, durationMinutes });
  }

  // نربط الموعد بعميل قائم إن وُجد بنفس الجوال، دون إنشاء عميل جديد قبل الزيارة.
  const existingCustomer = await prisma.customer.findFirst({
    where: { organizationId: input.organizationId, phone },
    select: { id: true },
  });

  const appointment = await prisma.appointment.create({
    data: {
      organizationId: input.organizationId,
      salonId: input.salonId,
      barberId: input.barberId ?? null,
      customerId: existingCustomer?.id ?? null,
      customerName: name,
      customerPhone: phone,
      startAt,
      durationMinutes,
      notes: input.notes?.trim() || null,
      source: input.source ?? "STAFF",
    },
    include: appointmentInclude,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      salonId: input.salonId,
      actorType: input.actorType ?? "ADMIN",
      actorUserId: input.actorUserId ?? null,
      action: "appointment.created",
      entityType: "Appointment",
      entityId: appointment.id,
      after: { startAt: startAt.toISOString(), barberId: input.barberId ?? null, customerPhone: phone },
    },
  });

  // فشل مزود Push لا يلغي الحجز: دالة الإرسال تعزل أخطاء كل جهاز وتعيد ملخصًا.
  await sendBarberAppointmentPush(prisma, {
    organizationId: input.organizationId,
    barberId: appointment.barberId,
    appointmentId: appointment.id,
    customerName: appointment.customerName,
    startAt: appointment.startAt,
  });

  return toAppointmentRow(appointment);
}

/** يمنع حجز موعدين متداخلين لنفس الحلاق — أكثر خطأ يقع في دفاتر المواعيد اليدوية. */
async function assertNoOverlap(
  prisma: AppointmentPrisma,
  input: { barberId: string; startAt: Date; durationMinutes: number; excludeId?: string },
) {
  const end = new Date(input.startAt.getTime() + input.durationMinutes * 60 * 1000);
  // نجلب مواعيد اليوم للحلاق ثم نفحص التداخل بالحساب (المدة عمود لا تعبير SQL).
  const dayStart = new Date(input.startAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const sameDay = await prisma.appointment.findMany({
    where: {
      barberId: input.barberId,
      status: { in: ACTIVE_STATUSES },
      startAt: { gte: dayStart, lt: dayEnd },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { startAt: true, durationMinutes: true },
  });

  const clash = sameDay.some((other) => {
    const otherStart = other.startAt.getTime();
    const otherEnd = otherStart + other.durationMinutes * 60 * 1000;
    return input.startAt.getTime() < otherEnd && otherStart < end.getTime();
  });

  if (clash) {
    throw new BusinessError("لدى الحلاق موعد آخر في هذا الوقت", 409);
  }
}

export async function listAppointments(
  prisma: AppointmentPrisma,
  filters: {
    organizationId: string;
    salonIds?: string[] | null;
    barberId?: string | null;
    date?: Date | string | null;
    status?: AppointmentStatus | null;
  },
) {
  const day = filters.date ? new Date(filters.date) : new Date();
  const from = new Date(day);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId: filters.organizationId,
      startAt: { gte: from, lt: to },
      ...(filters.salonIds && filters.salonIds.length > 0 ? { salonId: { in: filters.salonIds } } : {}),
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: appointmentInclude,
    orderBy: { startAt: "asc" },
  });

  return appointments.map(toAppointmentRow);
}

export async function updateAppointmentStatus(
  prisma: PrismaClient,
  appointmentId: string,
  status: AppointmentStatus,
  scope: {
    organizationId: string;
    salonIds?: string[] | null;
    actorUserId?: string | null;
    actorBarberId?: string | null;
    actorType?: "OWNER" | "ADMIN" | "SUPERVISOR" | "BARBER";
    reason?: string | null;
  },
) {
  const appointment = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      organizationId: scope.organizationId,
      ...(scope.salonIds && scope.salonIds.length > 0 ? { salonId: { in: scope.salonIds } } : {}),
    },
  });
  if (!appointment) throw new BusinessError("الموعد غير موجود", 404);

  if (appointment.status === "COMPLETED") {
    throw new BusinessError("الموعد مكتمل ولا يمكن تغيير حالته", 409);
  }
  if (status === "COMPLETED" && !appointment.visitId) {
    throw new BusinessError("يكتمل الموعد تلقائيًا عند تسجيل زيارته", 409);
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      status,
      ...(status === "CANCELLED"
        ? { cancelledAt: new Date(), cancelReason: scope.reason?.trim() || null }
        : { cancelledAt: null, cancelReason: null }),
    },
    include: appointmentInclude,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: scope.organizationId,
      salonId: appointment.salonId,
      actorType: scope.actorType ?? "ADMIN",
      actorUserId: scope.actorUserId ?? null,
      actorBarberId: scope.actorBarberId ?? null,
      action: "appointment.status_changed",
      entityType: "Appointment",
      entityId: appointment.id,
      before: { status: appointment.status },
      after: { status, reason: scope.reason ?? null },
    },
  });

  return toAppointmentRow(updated);
}

/** يربط الموعد بالزيارة الناتجة عنه ويقفله كمكتمل. يُستدعى بعد تأكيد الزيارة. */
export async function completeAppointmentWithVisit(
  prisma: AppointmentPrisma,
  appointmentId: string,
  visitId: string,
  organizationId: string,
) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, organizationId },
    select: { id: true, status: true },
  });
  if (!appointment) throw new BusinessError("الموعد غير موجود", 404);
  if (appointment.status === "COMPLETED") return null;

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "COMPLETED", visitId },
  });
}

function toAppointmentRow(
  appointment: Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>,
) {
  const endAt = new Date(appointment.startAt.getTime() + appointment.durationMinutes * 60 * 1000);
  return {
    id: appointment.id,
    startAt: appointment.startAt.toISOString(),
    endAt: endAt.toISOString(),
    durationMinutes: appointment.durationMinutes,
    status: appointment.status,
    statusLabel: APPOINTMENT_STATUS_LABELS[appointment.status],
    source: appointment.source,
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone,
    customerId: appointment.customerId,
    barber: appointment.barber ? { id: appointment.barber.id, name: appointment.barber.name } : null,
    salon: appointment.salon ? { id: appointment.salon.id, name: appointment.salon.name } : null,
    notes: appointment.notes,
    visitId: appointment.visitId,
    cancelReason: appointment.cancelReason,
  };
}
