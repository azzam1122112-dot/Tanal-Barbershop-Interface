"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { buildAppointmentWhatsAppMessage } from "@/lib/appointments/barber-contact";
import { toSaudiWhatsAppPhone } from "@/lib/phone/saudi-phone";
import { BarberRescheduleDialog } from "@/components/barber/reschedule-dialog";
import { RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";
import { barberDayBuckets, barberDayOffset } from "@/lib/appointments/barber-window";
import { formatAppointmentSpan, formatDurationLabel } from "@/lib/appointments/duration-format";
import { safeFetch } from "@/lib/http/safe-fetch";

type AppointmentStatus = "BOOKED" | "ARRIVED" | "CANCELLED" | "NO_SHOW";

export type BarberAppointment = {
  id: string;
  startAt: string;
  durationMinutes: number;
  status: AppointmentStatus | "COMPLETED";
  statusLabel: string;
  customerName: string;
  customerPhone: string;
  services: { serviceId: string; serviceName: string; durationMinutes: number }[];
  notes: string | null;
};

const shortDateFormatter = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  timeZone: RIYADH_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "short",
});
const messageDateFormatter = new Intl.DateTimeFormat("ar-SA", {
  timeZone: RIYADH_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function BarberAppointmentsPanel({
  initialAppointments,
  barberName,
  salonName,
}: {
  initialAppointments: BarberAppointment[];
  barberName: string;
  salonName?: string | null;
}) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [rescheduling, setRescheduling] = useState<BarberAppointment | null>(null);
  const [rescheduleShare, setRescheduleShare] = useState<BarberAppointment | null>(null);
  const pendingIdRef = useRef<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const refreshAppointments = useCallback(async () => {
    if (document.visibilityState === "hidden" || pendingIdRef.current) return;
    try {
      const response = await safeFetch("/api/barber/appointments", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as {
        appointments?: BarberAppointment[];
      };
      if (response.ok && data.appointments) setAppointments(data.appointments);
    } catch {
      // التحديث التالي يعيد المحاولة؛ لا نزعج الحلاق بتنبيه خطأ كل عدة ثوانٍ.
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => void refreshAppointments(), 10_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshAppointments();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshAppointments]);

  function onRescheduled(changed: BarberAppointment) {
    setAppointments((current) => {
      // خارج نافذة الأيام الثلاثة يختفي من الشاشة؛ داخلها ينتقل ليومه الجديد.
      if (barberDayOffset(changed.startAt) < 0) return current.filter((item) => item.id !== changed.id);
      return current.map((item) => (item.id === changed.id ? changed : item));
    });
    setRescheduleShare(changed);
    setRescheduling(null);
    setToast({ message: "تم تغيير الموعد. أبلغ العميل بالوقت الجديد عبر واتساب.", tone: "success" });
  }

  async function changeStatus(appointment: BarberAppointment, status: "ARRIVED" | "NO_SHOW" | "CANCELLED") {
    if (status === "NO_SHOW") {
      const accepted = await confirm({
        title: `تسجيل عدم حضور ${appointment.customerName}؟`,
        description: "ستُسجَّل مخالفة على العميل، وعند عدم الحضور لموعدين يُعلَّق حجزه الإلكتروني تلقائيًا.",
        confirmLabel: "تسجيل لم يحضر",
        tone: "danger",
      });
      if (!accepted) return;
    }

    if (status === "CANCELLED") {
      const accepted = await confirm({
        title: `إلغاء حجز ${appointment.customerName}؟`,
        description: "سيُلغى الموعد ويصبح الوقت متاحًا للحجز من جديد.",
        confirmLabel: "إلغاء الحجز",
        tone: "danger",
      });
      if (!accepted) return;
    }

    setPendingId(appointment.id);
    pendingIdRef.current = appointment.id;
    setToast(null);
    try {
      const response = await safeFetch(`/api/barber/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        appointment?: BarberAppointment;
        message?: string;
      };

      if (!response.ok || !data.appointment) {
        setToast({ message: data.message ?? "تعذر تحديث حالة الحجز", tone: "error" });
        return;
      }

      if (status === "ARRIVED") {
        setAppointments((current) =>
          current.map((item) => (item.id === appointment.id ? data.appointment! : item)),
        );
        setToast({ message: `تم تسجيل حضور ${appointment.customerName}`, tone: "success" });
      } else {
        setAppointments((current) => current.filter((item) => item.id !== appointment.id));
        setToast({
          message:
            status === "NO_SHOW"
              ? `تم تسجيل عدم حضور ${appointment.customerName} وتحديث سجل العميل`
              : `تم إلغاء حجز ${appointment.customerName}`,
          tone: "success",
        });
      }
    } catch {
      setToast({ message: "تعذر الاتصال بالخادم، حاول مرة أخرى", tone: "error" });
    } finally {
      setPendingId(null);
      pendingIdRef.current = null;
    }
  }

  // التجميع بمفتاح يوم الرياض لا بفارق ٢٤ ساعة: موعد ١١ مساءً وآخر ١ صباحًا
  // يومان مختلفان عند الحلاق مهما قرب الفارق بينهما.
  //
  // والموعد الذي بدأ أمس وما زال جاريًا (١١:٣٠ مساءً بمدة ساعة ونصف) يُضم إلى
  // «اليوم»: الخادم يرسله لأنه يتقاطع مع المدى، وبلا هذا الضم يسقط من كل
  // المجموعات فيختفي من الشاشة والحلاق يخدم صاحبه.
  const dayGroups = barberDayBuckets().map((bucket) => ({
    ...bucket,
    dateLabel: shortDateFormatter.format(parseDateKey(bucket.key)),
    items: appointments.filter((appointment) => {
      const offset = barberDayOffset(appointment.startAt);
      return offset === bucket.offset || (offset < 0 && bucket.offset === 0);
    }),
  }));

  return (
    <section id="appointments" className="barber-card scroll-mt-24 overflow-hidden">
      {confirmDialog}
      {rescheduling ? (
        <BarberRescheduleDialog
          appointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onChanged={onRescheduled}
        />
      ) : null}
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      <div className="barber-card-head flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold text-salon-ink">حجوزاتك القادمة</h2>
          <p className="mt-1 text-xs font-semibold text-salon-charcoal/60">
            اليوم وغدًا وبعد غد · تتحدّث تلقائيًا كل 10 ثوانٍ
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-salon-forest px-3 py-1 text-xs font-black text-white">
          {appointments.length}
        </span>
      </div>

      {/* شريط عدّادات الأيام: يرى الحلاق حِمل غدٍ قبل أن يمرّر إليه. */}
      {appointments.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 border-b border-salon-line/70 bg-salon-pearl px-4 py-3">
          {dayGroups.map((group) => (
            <div
              key={group.key}
              className={`rounded-xl border px-2 py-2 text-center ${
                group.items.length > 0 ? "border-salon-forest/30 bg-white" : "border-salon-line/70 bg-white/60"
              }`}
            >
              <p className="text-[11px] font-bold text-salon-charcoal/70">{group.label}</p>
              <p
                className={`mt-0.5 text-lg font-black tabular-nums ${
                  group.items.length > 0 ? "text-salon-forest" : "text-salon-charcoal/35"
                }`}
              >
                {group.items.length}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {rescheduleShare ? (
        <div className="border-b border-violet-200 bg-violet-50 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-violet-950">تم نقل موعد {rescheduleShare.customerName}</p>
              <p className="mt-1 text-xs font-semibold text-violet-900/65">
                الموعد الجديد: {messageDateFormatter.format(new Date(rescheduleShare.startAt))}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRescheduleShare(null)}
              aria-label="إخفاء"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-violet-700 transition hover:bg-violet-100"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
          <a
            href={buildWhatsAppUrl(rescheduleShare, barberName, salonName)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-[#128c7e] px-4 text-xs font-black text-white shadow-sm transition hover:bg-[#0f796d] active:scale-[0.99]"
          >
            إبلاغ العميل بالموعد الجديد عبر واتساب
          </a>
        </div>
      ) : null}

      {appointments.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-salon-mist text-salon-forest">
            <Icon name="check" className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-bold text-salon-ink">لا توجد حجوزات نشطة الآن</p>
          <p className="mt-1 text-xs font-semibold text-salon-charcoal/60">ستظهر الحجوزات الجديدة هنا تلقائيًا خلال ثوانٍ.</p>
        </div>
      ) : (
        <div>
          {dayGroups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <div key={group.key}>
                {/* عنوان اليوم لاصق: عند التمرير يبقى الحلاق عارفًا أي يوم يقرأ. */}
                <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 border-y border-salon-line/70 bg-salon-mist/95 px-4 py-2 backdrop-blur-sm">
                  <span className="text-xs font-black text-salon-ink">{group.label}</span>
                  <span className="text-[11px] font-bold text-salon-charcoal/60">
                    {group.dateLabel} · {group.items.length} حجز
                  </span>
                </div>
                <div className="divide-y divide-salon-line/70">
                  {group.items.map((appointment) => {
            const busy = pendingId === appointment.id;
            const arrived = appointment.status === "ARRIVED";
            // الحضور وعدمه لموعد اليوم فقط: ضغطة على «لم يحضر» لموعد الغد
            // تُعلّق حجز العميل الإلكتروني. الخادم يرفضها أيضًا.
            const isTodayAppointment = group.offset === 0;
            const canContact = appointment.status === "BOOKED" || appointment.status === "ARRIVED";
            const whatsappMessage = buildAppointmentWhatsAppMessage({
              customerName: appointment.customerName,
              barberName,
              salonName,
              appointmentDateTime: messageDateFormatter.format(new Date(appointment.startAt)),
            });
            const whatsappUrl = `https://wa.me/${toSaudiWhatsAppPhone(appointment.customerPhone)}?text=${encodeURIComponent(whatsappMessage)}`;

            return (
              <article key={appointment.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-salon-ink">{appointment.customerName}</h3>
                      {barberDayOffset(appointment.startAt) < 0 ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-800 ring-1 ring-amber-200">
                          بدأ أمس · جارٍ
                        </span>
                      ) : null}
                      {arrived ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200">
                          حضر
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-salon-charcoal/65" dir="ltr">
                      {appointment.customerPhone}
                    </p>
                    {appointment.services.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {appointment.services.map((service) => (
                          <li
                            key={service.serviceId}
                            className="rounded-xl bg-salon-forest/8 px-2.5 py-1 text-[11px] font-bold text-salon-forest ring-1 ring-salon-forest/15"
                          >
                            {service.serviceName}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {appointment.notes ? (
                      <p className="mt-2 rounded-xl bg-salon-mist px-3 py-2 text-xs font-semibold leading-5 text-salon-charcoal/75">
                        {appointment.notes}
                      </p>
                    ) : null}
                  </div>
                  {/* المدى لا البداية: الحلاق يحتاج أن يعرف متى يتحرّر كرسيه. */}
                  <div className="shrink-0 rounded-xl bg-salon-mist px-3 py-2 text-center">
                    <p className="text-sm font-black text-salon-forest" dir="ltr">
                      {formatAppointmentSpan(appointment.startAt, appointment.durationMinutes)}
                    </p>
                    <p className="mt-0.5 text-[10px] font-bold text-salon-charcoal/55">
                      {formatDurationLabel(appointment.durationMinutes)}
                    </p>
                  </div>
                </div>

                {canContact ? (
                  <div className="mt-4 rounded-2xl border border-salon-line/80 bg-salon-mist/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-salon-ink">تواصل سريع مع العميل</p>
                      <span className="text-[10px] font-bold text-salon-charcoal/55">بخصوص هذا الموعد</span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <a
                        href={`tel:${appointment.customerPhone}`}
                        className="flex min-h-11 items-center justify-center rounded-xl border border-salon-line bg-white px-3 text-xs font-black text-salon-ink shadow-sm transition hover:border-salon-forest/35 active:scale-[0.98]"
                      >
                        اتصال
                      </a>
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center justify-center rounded-xl bg-[#128c7e] px-3 text-xs font-black text-white shadow-sm transition hover:bg-[#0f796d] active:scale-[0.98]"
                      >
                        واتساب
                      </a>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRescheduling(appointment)}
                      className="mt-2 min-h-11 w-full rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black text-violet-800 transition hover:bg-violet-100 active:scale-[0.98] disabled:opacity-55"
                    >
                      تغيير موعد الحجز
                    </button>
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={busy || arrived || !isTodayAppointment}
                    aria-busy={busy}
                    onClick={() => void changeStatus(appointment, "ARRIVED")}
                    className={`min-h-11 rounded-xl px-2 text-xs font-black transition active:scale-[0.98] disabled:cursor-not-allowed ${
                      arrived
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-salon-forest text-white shadow-sm disabled:opacity-55"
                    }`}
                  >
                    {arrived ? "تم الحضور" : "حضر"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !isTodayAppointment}
                    aria-busy={busy}
                    onClick={() => void changeStatus(appointment, "NO_SHOW")}
                    className="min-h-11 rounded-xl border border-amber-200 bg-amber-50 px-2 text-xs font-black text-amber-800 transition active:scale-[0.98] disabled:opacity-55"
                  >
                    لم يحضر
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => void changeStatus(appointment, "CANCELLED")}
                    className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-2 text-xs font-black text-red-700 transition active:scale-[0.98] disabled:opacity-55"
                  >
                    إلغاء الحجز
                  </button>
                </div>
                {!isTodayAppointment ? (
                  <p className="mt-2 text-center text-[11px] font-bold text-salon-charcoal/55">
                    تسجيل الحضور يُفعَّل يوم الموعد. يمكنك الآن التواصل أو تغيير الموعد أو إلغاؤه.
                  </p>
                ) : null}
              </article>
            );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

function buildWhatsAppUrl(appointment: BarberAppointment, barberName: string, salonName?: string | null) {
  const message = buildAppointmentWhatsAppMessage({
    customerName: appointment.customerName,
    barberName,
    salonName,
    appointmentDateTime: messageDateFormatter.format(new Date(appointment.startAt)),
  });
  return `https://wa.me/${toSaudiWhatsAppPhone(appointment.customerPhone)}?text=${encodeURIComponent(message)}`;
}

/** `2026-08-12` → منتصف نهار ذلك اليوم، لعرض اسمه بلا انزياح منطقة زمنية. */
function parseDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(12, 0, 0, 0);
  return date;
}
