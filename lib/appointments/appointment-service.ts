import { Prisma, type AppointmentStatus, type PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { normalizeSaudiPhone } from "@/lib/phone/saudi-phone";
import { sendBarberAppointmentPush } from "@/lib/push/barber-push";
import { nextBookingDisciplineState } from "@/lib/appointments/booking-discipline";
import { addRiyadhDays, startOfRiyadhDay } from "@/lib/datetime/riyadh";
import { dayOverlapWindow, overlapWindowStart } from "@/lib/appointments/overlap-window";
import {
  appointmentServiceRows,
  appointmentServicesInclude,
  resolveAppointmentServices,
  toAppointmentServiceRows,
} from "@/lib/appointments/appointment-duration";

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
  services: appointmentServicesInclude,
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
    /** تجاوز يدوي. يُقدَّم على مجموع الخدمات: الموظف يعرف عميله. */
    durationMinutes?: number;
    serviceIds?: string[];
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

  // الخدمات هي المصدر الافتراضي للمدة؛ الثلاثون دقيقة تبقى للحجز بلا تفصيل
  // (مكالمة هاتفية «احجز لي بعد العصر») لا كافتراض عن كل موعد.
  const resolved = await resolveAppointmentServices(prisma, {
    organizationId: input.organizationId,
    salonId: input.salonId,
    serviceIds: input.serviceIds ?? [],
  });
  const durationMinutes =
    input.durationMinutes && input.durationMinutes > 0
      ? input.durationMinutes
      : (resolved?.bookedMinutes ?? 30);

  const phone = normalizeSaudiPhone(input.customerPhone);
  const name = input.customerName.trim();
  if (!name) throw new BusinessError("اسم العميل مطلوب");

  const appointment = await runSerializableAppointmentTransaction(prisma, async (tx) => {
    const salon = await tx.salon.findFirst({
      where: { id: input.salonId, organizationId: input.organizationId, isActive: true },
      select: { id: true },
    });
    if (!salon) throw new BusinessError("الفرع غير موجود", 404);

    if (input.barberId) {
      const barber = await tx.barber.findFirst({
        where: { id: input.barberId, organizationId: input.organizationId, salonId: input.salonId, isActive: true },
        select: { id: true },
      });
      if (!barber) throw new BusinessError("الحلاق غير موجود في هذا الفرع", 404);
      await assertNoOverlap(tx, { barberId: input.barberId, startAt, durationMinutes });
    }

    // نربط الموعد بعميل قائم إن وُجد بنفس الجوال، دون إنشاء عميل جديد قبل الزيارة.
    const existingCustomer = await tx.customer.findFirst({
      where: { organizationId: input.organizationId, phone },
      select: { id: true },
    });

    const created = await tx.appointment.create({
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
        services: appointmentServiceRows(resolved),
      },
      include: appointmentInclude,
    });

    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        salonId: input.salonId,
        actorType: input.actorType ?? "ADMIN",
        actorUserId: input.actorUserId ?? null,
        action: "appointment.created",
        entityType: "Appointment",
        entityId: created.id,
        after: {
          startAt: startAt.toISOString(),
          barberId: input.barberId ?? null,
          customerPhone: phone,
          durationMinutes,
          serviceIds: resolved?.lines.map((line) => line.serviceId) ?? [],
        },
      },
    });
    return created;
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

async function runSerializableAppointmentTransaction<T>(
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
  throw new BusinessError("تعذر حجز الموعد بعد عدة محاولات");
}

/** يمنع حجز موعدين متداخلين لنفس الحلاق — أكثر خطأ يقع في دفاتر المواعيد اليدوية. */
async function assertNoOverlap(
  prisma: AppointmentPrisma,
  input: { barberId: string; startAt: Date; durationMinutes: number; excludeId?: string },
) {
  const end = new Date(input.startAt.getTime() + input.durationMinutes * 60 * 1000);
  // نجلب مواعيد الحلاق ثم نفحص التداخل بالحساب (المدة عمود لا تعبير SQL).
  // النافذة موسّعة للخلف: هذا المسار لا يفحص الدوام، فموعد ممتدّ عبر منتصف
  // الليل مسموح هنا ويجب أن يظهر عند فحص اليوم التالي.
  const sameDay = await prisma.appointment.findMany({
    where: {
      barberId: input.barberId,
      status: { in: ACTIVE_STATUSES },
      startAt: dayOverlapWindow(input.startAt),
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
    /** عدد أيام الرياض المعروضة ابتداءً من `date`. الافتراضي يوم واحد. */
    days?: number;
    status?: AppointmentStatus | null;
  },
) {
  const day = filters.date ? new Date(filters.date) : new Date();
  const from = startOfRiyadhDay(day);
  // نافذة الأيام تُحسب بأيام الرياض لا بـ24 ساعة، فلا ينزلق الحد مع التوقيت.
  const dayCount = Math.min(Math.max(Math.trunc(filters.days ?? 1), 1), 14);
  const to = addRiyadhDays(from, dayCount);

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId: filters.organizationId,
      // موسّعة للخلف بأقصى مدة، تمامًا كنافذة فحص التداخل: موعد يبدأ 11:30 مساءً
      // بمدة ٩٠ دقيقة كان يسقط من الشاشة عند منتصف الليل والحلاق يخدم صاحبه —
      // ومعه زر «حضر» وبطاقة التواصل.
      startAt: { gte: overlapWindowStart(from), lt: to },
      ...(filters.salonIds && filters.salonIds.length > 0 ? { salonId: { in: filters.salonIds } } : {}),
      ...(filters.barberId ? { barberId: filters.barberId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: appointmentInclude,
    orderBy: { startAt: "asc" },
  });

  // المعيار تقاطع الموعد مع المدى لا بدايته داخله: ما انتهى قبل بداية المدى
  // لا يخصّه، وما زال جاريًا عنده يخصّه ولو بدأ أمس.
  return appointments
    .filter((appointment) => {
      if (appointment.startAt >= from) return true;
      return appointment.startAt.getTime() + appointment.durationMinutes * 60_000 > from.getTime();
    })
    .map(toAppointmentRow);
}

export async function updateAppointmentStatus(
  prisma: PrismaClient,
  appointmentId: string,
  status: AppointmentStatus,
  scope: {
    organizationId: string;
    salonIds?: string[] | null;
    barberId?: string | null;
    allowedCurrentStatuses?: AppointmentStatus[];
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
      ...(scope.barberId ? { barberId: scope.barberId } : {}),
      ...(scope.allowedCurrentStatuses ? { status: { in: scope.allowedCurrentStatuses } } : {}),
    },
  });
  if (!appointment) throw new BusinessError("الموعد غير موجود", 404);

  if (appointment.status === "COMPLETED") {
    throw new BusinessError("الموعد مكتمل ولا يمكن تغيير حالته", 409);
  }
  if (status === "COMPLETED" && !appointment.visitId) {
    throw new BusinessError("يكتمل الموعد تلقائيًا عند تسجيل زيارته", 409);
  }
  // الحضور وعدمه واقعتان لا تُسجَّلان قبل يومهما. صارت الشاشة تعرض ثلاثة أيام،
  // وضغطة خاطئة على «لم يحضر» لموعد الغد تُعلّق حجز العميل الإلكتروني.
  if ((status === "ARRIVED" || status === "NO_SHOW") && appointment.startAt >= addRiyadhDays(startOfRiyadhDay(new Date()), 1)) {
    throw new BusinessError("لا تُسجَّل حالة الحضور قبل يوم الموعد", 409);
  }

  const updated = await prisma.$transaction(async (tx) => {
    let disciplineAfter: ReturnType<typeof nextBookingDisciplineState> = null;

    // Claim the status transition atomically so concurrent requests cannot
    // count the same no-show more than once.
    const claimed = await tx.appointment.updateMany({
      where: { id: appointment.id, status: appointment.status },
      data: {
        status,
        ...(status === "CANCELLED"
          ? { cancelledAt: new Date(), cancelReason: scope.reason?.trim() || null }
          : { cancelledAt: null, cancelReason: null }),
      },
    });

    if (claimed.count === 0) {
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: appointmentInclude,
      });
    }

    if (appointment.customerId && appointment.status !== status) {
      const customer = await tx.customer.findFirst({
        where: { id: appointment.customerId, organizationId: scope.organizationId },
        select: {
          id: true,
          bookingNoShowCount: true,
          bookingBlockedAt: true,
          bookingBlockReason: true,
        },
      });
      if (customer) {
        disciplineAfter = nextBookingDisciplineState(customer, appointment.status, status);
        if (disciplineAfter) {
          await tx.customer.update({ where: { id: customer.id }, data: disciplineAfter });
        }
      }
    }

    const changed = await tx.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
      include: appointmentInclude,
    });

    await tx.auditLog.create({
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
        after: {
          status,
          reason: scope.reason ?? null,
          ...(disciplineAfter
            ? {
                bookingNoShowCount: disciplineAfter.bookingNoShowCount,
                bookingBlocked: Boolean(disciplineAfter.bookingBlockedAt),
              }
            : {}),
        },
      },
    });

    return changed;
  });

  return toAppointmentRow(updated);
}

/**
 * يربط الموعد بالزيارة الناتجة عنه ويقفله كمكتمل.
 *
 * **تُستدعى داخل معاملة الزيارة نفسها** (`confirmVisit`)، فإمّا تُحفظ الزيارة
 * ويُقفل موعدها معًا أو لا شيء. `COMPLETED` هي الحالة الوحيدة التي لا يضبطها
 * `updateAppointmentStatus` — هناك تُرفض صراحةً برسالة «يكتمل الموعد تلقائيًا عند
 * تسجيل زيارته»، وهذا هو الموضع الذي يفي بذلك الوعد.
 *
 * **النطاق مفروض داخل `where` لا بعده**، وبثلاثة قيود لا واحد:
 * - **الفرع** مع المؤسسة: موعد فرع آخر لا يُجلب أصلًا (عزل المستأجرين والفروع).
 * - **الحلاق**: موعدٌ مُسند لحلاق لا يقفله غيره. لولا هذا لأغلق حلاقٌ موعد زميله
 *   بزيارته هو، فيظهر في تقرير الزملاء أن الموعد أُنجز ولم يُنجزه صاحبه.
 * - **العميل**: موعد باسم عميل لا يُقفل بزيارة عميل آخر — وإلا حمل سجلُّ العميل
 *   موعدًا مكتملًا لم يحضره، وحُسبت زيارةُ غيره إنجازًا له.
 *
 * والإرجاع `null` عند عدم وجود ما يُقفل: بلا موعد مطابق، أو مقفل سلفًا. الزيارة
 * لا تفشل لأن موعدها أُلغي أو أُغلق في نافذة أخرى — النقد استُلم والخدمة قُدّمت،
 * ورفضُ الزيارة عندها خسارةٌ حقيقية مقابل اتساقٍ شكلي.
 */
export type CloseableAppointmentScope = {
  appointmentId: string;
  organizationId: string;
  salonId: string;
  barberId: string;
  customerId?: string | null;
};

/**
 * شرط «هذا الموعد قابل لأن تقفله هذه الزيارة» — **مصدر حكم واحد**.
 *
 * تقرؤه شاشةُ تسجيل الزيارة لتعرض الموعد، ويقرؤه القفلُ نفسه وقت التأكيد. لو
 * كُتب الشرطان منفصلين لانحرف أحدهما: تعرض الشاشة «موعد ٥:٢٠ — أحمد» ثم يرفض
 * الخادم قفله بصمت، فيمضي الحلاق ظانًّا أن الموعد أُغلق.
 */
function closeableAppointmentWhere(scope: CloseableAppointmentScope): Prisma.AppointmentWhereInput {
  return {
    id: scope.appointmentId,
    organizationId: scope.organizationId,
    salonId: scope.salonId,
    // لم يُقفل بعد: الحالة والزيارة معًا، فلا يُكتب فوق ربطٍ قائم.
    status: { in: ["BOOKED", "ARRIVED"] },
    visitId: null,
    // موعد بلا حلاق مُسند (حجز عام) يقفله من قدّم الخدمة فعلًا.
    OR: [{ barberId: null }, { barberId: scope.barberId }],
    // زيارة زائر (بلا عميل) تقفل موعدًا بلا عميل فقط، والعكس بالعكس.
    customerId: scope.customerId ?? null,
  };
}

/**
 * الموعد المفتوح الذي تصلح هذه الزيارة لقفله، أو `null`.
 *
 * تستدعيها شاشة تسجيل الزيارة لتعرض للحلاق أي موعد سيُقفل قبل أن يضغط «إتمام».
 * قراءة محضة بلا أثر — الحكم النهائي يبقى داخل معاملة الزيارة.
 */
export async function findCloseableAppointment(prisma: AppointmentPrisma, scope: CloseableAppointmentScope) {
  const appointment = await prisma.appointment.findFirst({
    where: closeableAppointmentWhere(scope),
    select: {
      id: true,
      startAt: true,
      durationMinutes: true,
      customerName: true,
      status: true,
      services: { select: { serviceId: true, serviceName: true }, orderBy: { serviceName: "asc" } },
    },
  });
  if (!appointment) return null;

  return {
    id: appointment.id,
    startAt: appointment.startAt.toISOString(),
    durationMinutes: appointment.durationMinutes,
    customerName: appointment.customerName,
    statusLabel: APPOINTMENT_STATUS_LABELS[appointment.status],
    serviceIds: appointment.services.map((service) => service.serviceId),
    serviceNames: appointment.services.map((service) => service.serviceName),
  };
}

export async function completeAppointmentWithVisit(
  prisma: AppointmentPrisma,
  input: CloseableAppointmentScope & { visitId: string },
) {
  // `updateMany` لا `update`: الشرط كله — النطاق والحالة وغياب الزيارة — يُقيَّم
  // ذرّيًا في عبارة واحدة، فلا نافذة بين القراءة والكتابة يسبقنا فيها طلب آخر.
  const claimed = await prisma.appointment.updateMany({
    where: closeableAppointmentWhere(input),
    data: { status: "COMPLETED", visitId: input.visitId, cancelledAt: null, cancelReason: null },
  });
  if (claimed.count !== 1) return null;

  return prisma.appointment.findUnique({ where: { id: input.appointmentId } });
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
    services: toAppointmentServiceRows(appointment.services),
    visitId: appointment.visitId,
    cancelReason: appointment.cancelReason,
  };
}
