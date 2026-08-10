"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { buildAppointmentWhatsAppMessage } from "@/lib/appointments/barber-contact";
import { toSaudiWhatsAppPhone } from "@/lib/phone/saudi-phone";
import { BarberRescheduleDialog } from "@/components/barber/reschedule-dialog";

type AppointmentStatus = "BOOKED" | "ARRIVED" | "CANCELLED" | "NO_SHOW";

export type BarberAppointment = {
  id: string;
  startAt: string;
  durationMinutes: number;
  status: AppointmentStatus | "COMPLETED";
  statusLabel: string;
  customerName: string;
  customerPhone: string;
  notes: string | null;
};

const timeFormatter = new Intl.DateTimeFormat("ar-SA", {
  hour: "2-digit",
  minute: "2-digit",
});
const messageDateFormatter = new Intl.DateTimeFormat("ar-SA", {
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
  const { confirm, confirmDialog } = useConfirm();

  function onRescheduled(changed: BarberAppointment) {
    setAppointments((current) => {
      if (!isToday(changed.startAt)) return current.filter((item) => item.id !== changed.id);
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
    setToast(null);
    try {
      const response = await fetch(`/api/barber/appointments/${appointment.id}`, {
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
    }
  }

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
        <div>
          <h2 className="font-bold text-salon-ink">مواعيدك اليوم</h2>
          <p className="mt-1 text-xs font-semibold text-salon-charcoal/60">حدّث حالة كل حجز مباشرة</p>
        </div>
        <span className="rounded-full bg-salon-forest px-3 py-1 text-xs font-black text-white">
          {appointments.length}
        </span>
      </div>

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
          <p className="mt-1 text-xs font-semibold text-salon-charcoal/60">ستظهر الحجوزات الجديدة هنا تلقائيًا عند تحديث الصفحة.</p>
        </div>
      ) : (
        <div className="divide-y divide-salon-line/70">
          {appointments.map((appointment) => {
            const busy = pendingId === appointment.id;
            const arrived = appointment.status === "ARRIVED";
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
                      {arrived ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200">
                          حضر
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-salon-charcoal/65" dir="ltr">
                      {appointment.customerPhone}
                    </p>
                    {appointment.notes ? (
                      <p className="mt-2 rounded-xl bg-salon-mist px-3 py-2 text-xs font-semibold leading-5 text-salon-charcoal/75">
                        {appointment.notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 rounded-xl bg-salon-mist px-3 py-2 text-center">
                    <p className="text-sm font-black text-salon-forest">{timeFormatter.format(new Date(appointment.startAt))}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-salon-charcoal/55">{appointment.durationMinutes} دقيقة</p>
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
                    disabled={busy || arrived}
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
                    disabled={busy}
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
              </article>
            );
          })}
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

function isToday(startAt: string) {
  const value = new Date(startAt);
  const today = new Date();
  return (
    value.getFullYear() === today.getFullYear() &&
    value.getMonth() === today.getMonth() &&
    value.getDate() === today.getDate()
  );
}
