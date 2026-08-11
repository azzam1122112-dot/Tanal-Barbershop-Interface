import Link from "next/link";
import { formatAppointmentSpan, formatDurationLabel } from "@/lib/appointments/duration-format";
import { RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";

/**
 * الموعد القادم — بطاقة لا سطر.
 *
 * ما يحتاجه العميل قبل أن يخرج من بيته: متى يبدأ ومتى ينتهي، مع من، في أي فرع،
 * وماذا حجز. وإرشاد الحضور المبكر معه لا في صفحة أخرى.
 */

const dayFormatter = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", {
  timeZone: RIYADH_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

export type NextAppointmentSummary = {
  id: string;
  startAt: string;
  durationMinutes: number;
  arrived: boolean;
  barberName: string | null;
  salonName: string | null;
  services: string[];
};

/** «احضر قبل موعدك بـ10 دقائق» — الوقت الفعلي لا الفرق المجرّد. */
export function arriveByLabel(startAt: string, arriveEarlyMinutes: number) {
  if (arriveEarlyMinutes <= 0) return null;
  const arriveAt = new Date(new Date(startAt).getTime() - arriveEarlyMinutes * 60_000);
  const clock = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: RIYADH_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(arriveAt);
  return { minutes: arriveEarlyMinutes, clock };
}

export function NextAppointmentCard({
  appointment,
  arriveEarlyMinutes,
  manageHref,
}: {
  appointment: NextAppointmentSummary;
  arriveEarlyMinutes: number;
  manageHref?: string;
}) {
  const arrive = arriveByLabel(appointment.startAt, arriveEarlyMinutes);

  return (
    <section className="overflow-hidden rounded-2xl border border-salon-forest/25 bg-salon-forest/[0.07] shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-3 border-b border-salon-forest/15 px-5 py-3">
        <h2 className="lux-eyebrow text-salon-forest">موعدك القادم</h2>
        {appointment.arrived ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800">
            سُجّل حضورك
          </span>
        ) : null}
      </div>

      <div className="px-5 py-4">
        <p className="text-base font-bold text-salon-ink">{dayFormatter.format(new Date(appointment.startAt))}</p>
        <p className="mt-1 text-lg font-black text-salon-forest" dir="ltr">
          {formatAppointmentSpan(appointment.startAt, appointment.durationMinutes)}
        </p>
        <p className="mt-0.5 text-xs font-bold text-salon-charcoal/65">
          {formatDurationLabel(appointment.durationMinutes)}
          {appointment.barberName ? ` · مع ${appointment.barberName}` : ""}
          {appointment.salonName ? ` · ${appointment.salonName}` : ""}
        </p>

        {appointment.services.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {appointment.services.map((service) => (
              <li
                key={service}
                className="rounded-xl bg-white px-2.5 py-1 text-[11px] font-bold text-salon-forest ring-1 ring-salon-forest/15"
              >
                {service}
              </li>
            ))}
          </ul>
        ) : null}

        {arrive && !appointment.arrived ? (
          <p className="mt-4 rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold leading-5 text-salon-ink">
            احضر قبل موعدك بـ{arrive.minutes} دقائق —{" "}
            <span className="text-salon-forest" dir="ltr">
              {arrive.clock}
            </span>
          </p>
        ) : null}

        {manageHref ? (
          <Link
            href={manageHref}
            className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-salon-forest/30 bg-white text-xs font-black text-salon-forest transition hover:border-salon-forest/60"
          >
            إدارة مواعيدي
          </Link>
        ) : null}
      </div>
    </section>
  );
}
