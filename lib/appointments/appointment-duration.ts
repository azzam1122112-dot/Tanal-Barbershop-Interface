import type { Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { roundMoney } from "@/lib/visits/visit-totals";
import { MAX_APPOINTMENT_MINUTES } from "@/lib/appointments/overlap-window";

/**
 * اشتقاق مدة الموعد من خدماته — مصدر حقيقة واحد.
 *
 * **القاعدة الأمنية:** المدة تُقرأ من الكتالوج ولا تُقبل من العميل، تمامًا كأسعار
 * المنتجات في `resolveProductLines`. لو قُبل رقم من الواجهة لأرسل العميل «30»
 * مع تسعين دقيقة خدمات فسرق جدول الحلاق وأوقع ثلاثة عملاء على كرسي واحد.
 *
 * **التقريب لأعلى لمضاعف الفترة:** `isBarberOnDuty` يشترط أن تكون البداية على
 * الشبكة (`(minuteOfDay - openMinute) % slotMinutes === 0`). خدمة 45 دقيقة على
 * شبكة 30 تحجز 60 — لا فتاتَ ربعِ ساعة عالقًا بين موعدين لا يُحجز ولا يُرى،
 * وللحلاق هامش تنظيف بين العميل والذي يليه.
 */

type DurationPrisma = PrismaClient | Prisma.TransactionClient;

/**
 * أقصى عدد خدمات في موعد واحد. حارس ضد طلب يحمل مئة معرّف فيقفل يوم الحلاق
 * كاملًا بضغطة، وحدٌّ واقعي: زيارة الصالون لا تتجاوز حفنة خدمات.
 */
export const MAX_APPOINTMENT_SERVICES = 8;

export type ResolvedAppointmentService = {
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  estimatedPrice: number;
  sortOrder: number;
};

export type ResolvedAppointmentDuration = {
  lines: ResolvedAppointmentService[];
  /** مجموع مدد الخدمات كما في الكتالوج، قبل التقريب. */
  serviceMinutes: number;
  /** المدة المحجوزة فعليًا في الجدول: مقرَّبة لأعلى لمضاعف الفترة. */
  bookedMinutes: number;
  /** مجموع الأسعار الإرشادية. المُحصَّل يُحسم في الزيارة لا هنا. */
  estimatedTotal: number;
};

/** أصغر مضاعف للفترة يسع `minutes`، وفترةٌ واحدة على الأقل. */
export function roundUpToSlot(minutes: number, slotMinutes: number) {
  if (slotMinutes <= 0) return minutes;
  return Math.max(slotMinutes, Math.ceil(minutes / slotMinutes) * slotMinutes);
}

/**
 * يقرأ الخدمات المطلوبة من القاعدة ويحسب مدة الموعد وسعره الإرشادي.
 *
 * قائمة فارغة تُعيد `null` لا خطأ: الحجز بلا تحديد خدمة يبقى مقبولًا (الموظف
 * يحجز بمكالمة هاتفية بلا تفصيل)، ويسقط عندها إلى مدة الفترة الافتراضية.
 */
export async function resolveAppointmentServices(
  prisma: DurationPrisma,
  input: {
    organizationId: string;
    salonId: string;
    serviceIds: string[];
    /**
     * شبكة الحجز الذاتي. تُمرَّر من مسار العميل وحده — حجز الموظف حرّ بالتصميم
     * ولا يُقيَّد بالشبكة، فتقريبُ مدته يحجب وقتًا لا يعمل فيه أحد.
     */
    slotMinutes?: number;
  },
): Promise<ResolvedAppointmentDuration | null> {
  // إزالة التكرار مع حفظ ترتيب الاختيار — المكرَّر يعني مدة مضاعفة بلا قصد.
  const requested = [...new Set(input.serviceIds.map((id) => id.trim()).filter(Boolean))];
  if (requested.length === 0) return null;
  if (requested.length > MAX_APPOINTMENT_SERVICES) {
    throw new BusinessError(`لا يمكن اختيار أكثر من ${MAX_APPOINTMENT_SERVICES} خدمات في موعد واحد`);
  }

  const services = await prisma.service.findMany({
    where: {
      id: { in: requested },
      organizationId: input.organizationId,
      salonId: input.salonId,
      isActive: true,
    },
    select: { id: true, name: true, durationMinutes: true, defaultPrice: true },
  });

  if (services.length !== requested.length) {
    throw new BusinessError("إحدى الخدمات المختارة غير متاحة في هذا الفرع");
  }

  const byId = new Map(services.map((service) => [service.id, service]));
  const lines: ResolvedAppointmentService[] = requested.map((serviceId, index) => {
    const service = byId.get(serviceId)!;
    return {
      serviceId: service.id,
      serviceName: service.name,
      // صفٌّ قديم أو تعديل مباشر قد يحمل صفرًا؛ خدمة بلا مدة تجعل الموعد بلا وقت.
      durationMinutes: Math.max(1, service.durationMinutes),
      estimatedPrice: Number(service.defaultPrice),
      sortOrder: index,
    };
  });

  const serviceMinutes = lines.reduce((total, line) => total + line.durationMinutes, 0);
  if (serviceMinutes > MAX_APPOINTMENT_MINUTES) {
    throw new BusinessError(
      `مدة الخدمات المختارة تتجاوز ${MAX_APPOINTMENT_MINUTES / 60} ساعات — احجز موعدين منفصلين`,
    );
  }

  const bookedMinutes = input.slotMinutes
    ? roundUpToSlot(serviceMinutes, input.slotMinutes)
    : serviceMinutes;
  if (bookedMinutes > MAX_APPOINTMENT_MINUTES) {
    throw new BusinessError("مدة الخدمات المختارة أطول من أن تُحجز في موعد واحد");
  }

  return {
    lines,
    serviceMinutes,
    bookedMinutes,
    estimatedTotal: roundMoney(lines.reduce((total, line) => total + line.estimatedPrice, 0)),
  };
}

/** سطور جاهزة لـ `create.services.createMany` داخل معاملة الموعد. */
export function appointmentServiceRows(resolved: ResolvedAppointmentDuration | null) {
  if (!resolved) return undefined;
  return {
    createMany: {
      data: resolved.lines.map((line) => ({
        serviceId: line.serviceId,
        serviceName: line.serviceName,
        durationMinutes: line.durationMinutes,
        estimatedPrice: line.estimatedPrice,
        sortOrder: line.sortOrder,
      })),
    },
  } satisfies Prisma.AppointmentServiceCreateNestedManyWithoutAppointmentInput;
}

/** `include` موحّد لقراءة سطور الموعد مرتّبة كما اختارها العميل. */
export const appointmentServicesInclude = {
  select: {
    serviceId: true,
    serviceName: true,
    durationMinutes: true,
    estimatedPrice: true,
  },
  orderBy: { sortOrder: "asc" },
} satisfies Prisma.Appointment$servicesArgs;

export type AppointmentServiceRow = {
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  estimatedPrice: number;
};

export function toAppointmentServiceRows(
  services: { serviceId: string; serviceName: string; durationMinutes: number; estimatedPrice: Prisma.Decimal }[],
): AppointmentServiceRow[] {
  return services.map((service) => ({
    serviceId: service.serviceId,
    serviceName: service.serviceName,
    durationMinutes: service.durationMinutes,
    estimatedPrice: Number(service.estimatedPrice),
  }));
}
