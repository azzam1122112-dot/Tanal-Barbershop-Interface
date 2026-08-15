import { RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";
import { formatAppointmentSpan } from "@/lib/appointments/duration-format";

/**
 * إشعار «هذه الزيارة تُقفل موعدًا» فوق نموذج التسجيل.
 *
 * **يُعرض فقط حين يكون القفل مؤكَّدًا.** الموعد يمرّ أولًا على
 * `findCloseableAppointment` بالشرط نفسه الذي سيحكم القفل داخل معاملة الزيارة،
 * فلا يقرأ الحلاق وعدًا يخلفه الخادم بصمت. ومتى لم يوجد موعد مطابق لا يُرسم
 * شيء — لا تنبيه بغيابه: الزيارة المباشرة هي الأصل لا الاستثناء.
 *
 * ولا يحمل زر إلغاء ولا اختيار: الموعد يُقفل بإتمام الزيارة نفسها، والتراجع
 * عنه تراجعٌ عن الزيارة.
 */
export function AppointmentCloseNote({
  appointment,
}: {
  appointment: {
    id: string;
    startAt: string;
    durationMinutes: number;
    customerName: string;
    serviceNames: string[];
  } | null;
}) {
  if (!appointment) return null;

  const dayLabel = dayFormatter.format(new Date(appointment.startAt));
  const span = formatAppointmentSpan(appointment.startAt, appointment.durationMinutes);

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-0.5 text-base leading-none">📌</span>
        <div className="min-w-0">
          <p className="text-xs font-black tracking-[0.14em] text-violet-800">مرتبطة بموعد محجوز</p>
          <p className="mt-1.5 font-bold text-salon-ink">
            {appointment.customerName} · {span}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-salon-charcoal/70">{dayLabel}</p>
          {appointment.serviceNames.length > 0 ? (
            <p className="mt-1.5 text-xs font-semibold text-salon-charcoal/70">
              الخدمات المحجوزة: {appointment.serviceNames.join(" · ")}
            </p>
          ) : null}
          <p className="mt-2 text-xs font-semibold leading-5 text-violet-900/80">
            بإتمام هذه العملية يُقفل الموعد كمكتمل تلقائيًا.
          </p>
        </div>
      </div>
    </div>
  );
}

const dayFormatter = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  timeZone: RIYADH_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});
