"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { InlineEmpty } from "@/components/dashboard/ui";
import { parseRiyadhDateKey, RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";

type Appointment = {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: "BOOKED" | "ARRIVED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  statusLabel: string;
  customerName: string;
  customerPhone: string;
  customerId: string | null;
  barber: { id: string; name: string } | null;
  salon: { id: string; name: string } | null;
  notes: string | null;
  visitId: string | null;
};

type BarberOption = { id: string; name: string; salonId: string | null };
type SalonOption = { id: string; name: string };

const timeFormatter = new Intl.DateTimeFormat("ar-SA", {
  timeZone: RIYADH_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

export function AppointmentsManager({
  initialAppointments,
  barbers,
  salons,
  defaultSalonId,
  date,
}: {
  initialAppointments: Appointment[];
  barbers: BarberOption[];
  salons: SalonOption[];
  defaultSalonId: string | null;
  date: string;
}) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [salonId, setSalonId] = useState(defaultSalonId ?? salons[0]?.id ?? "");
  const { confirm, confirmDialog } = useConfirm();

  // الحلاقون المعروضون يتبعون الفرع المختار حتى لا يُحجز حلاق من فرع آخر.
  const salonBarbers = barbers.filter((barber) => !salonId || barber.salonId === salonId);
  const active = appointments.filter((item) => item.status === "BOOKED" || item.status === "ARRIVED");

  async function createAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const time = String(form.get("time") ?? "");
    const [hour, minute] = time.split(":").map(Number);
    const riyadhMidnight = parseRiyadhDateKey(date);
    const startAt = new Date(riyadhMidnight.getTime() + (hour * 60 + minute) * 60_000);

    const response = await fetch("/api/dashboard/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salonId,
        barberId: form.get("barberId") || null,
        customerName: form.get("customerName"),
        customerPhone: form.get("customerPhone"),
        // وقت الإدخال هو وقت الفرع في الرياض مهما كانت منطقة جهاز المدير.
        startAt: startAt.toISOString(),
        durationMinutes: Number(form.get("durationMinutes")) || 30,
        notes: form.get("notes") || null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { appointment?: Appointment; message?: string };

    if (response.ok && data.appointment) {
      setAppointments((current) =>
        [...current, data.appointment!].sort((a, b) => a.startAt.localeCompare(b.startAt)),
      );
      formEl.reset();
      setToast({ message: "تم حفظ الموعد", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر حفظ الموعد", tone: "error" });
    }
    setLoading(false);
  }

  async function setStatus(appointment: Appointment, status: Appointment["status"], reason?: string) {
    setPendingId(appointment.id);
    setToast(null);
    const response = await fetch(`/api/dashboard/appointments/${appointment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason }),
    });
    const data = (await response.json().catch(() => ({}))) as { appointment?: Appointment; message?: string };

    if (response.ok && data.appointment) {
      setAppointments((current) => current.map((item) => (item.id === appointment.id ? data.appointment! : item)));
      setToast({
        message:
          status === "NO_SHOW"
            ? "تم تسجيل عدم الحضور. المخالفة الثانية تعلّق الحجز الإلكتروني للعميل."
            : reason === "تصحيح حالة عدم الحضور"
              ? "تم تصحيح الحالة وإعادة احتساب أهلية العميل للحجز."
              : "تم تحديث حالة الموعد",
        tone: "success",
      });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث الموعد", tone: "error" });
    }
    setPendingId(null);
  }

  async function cancelAppointment(appointment: Appointment) {
    const confirmed = await confirm({
      title: `إلغاء موعد ${appointment.customerName}؟`,
      description: "سيبقى الموعد في السجل بحالة «ملغى».",
      confirmLabel: "إلغاء الموعد",
      tone: "danger",
    });
    if (!confirmed) return;
    await setStatus(appointment, "CANCELLED");
  }

  async function markNoShow(appointment: Appointment) {
    const confirmed = await confirm({
      title: `تسجيل عدم حضور ${appointment.customerName}؟`,
      description: "ستُحتسب مخالفة على العميل. عند عدم الحضور لموعدين يُعلَّق حجزه الإلكتروني تلقائيًا.",
      confirmLabel: "تسجيل عدم الحضور",
      tone: "danger",
    });
    if (!confirmed) return;
    await setStatus(appointment, "NO_SHOW");
  }

  async function correctNoShow(appointment: Appointment) {
    const confirmed = await confirm({
      title: `تصحيح حالة ${appointment.customerName}؟`,
      description: "ستُحذف هذه المخالفة من عدّاد عدم الحضور، وقد يُعاد تفعيل حجز العميل تلقائيًا.",
      confirmLabel: "تصحيح الحالة",
    });
    if (!confirmed) return;
    await setStatus(appointment, "CANCELLED", "تصحيح حالة عدم الحضور");
  }

  return (
    <div className="mt-6 grid items-start gap-6 xl:grid-cols-[380px_1fr]">
      {confirmDialog}
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      <form onSubmit={createAppointment} className="dashboard-panel h-fit space-y-3 p-5">
        <h2 className="text-lg font-bold tracking-tight">حجز موعد</h2>
        <p className="dashboard-muted text-sm">الحجز اختياري — الصالون يستقبل بلا موعد أيضًا.</p>

        {salons.length > 1 ? (
          <label className="block text-sm font-semibold">
            الفرع
            <select value={salonId} onChange={(event) => setSalonId(event.target.value)} className="dashboard-field mt-2">
              {salons.map((salon) => (
                <option key={salon.id} value={salon.id}>
                  {salon.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block text-sm font-semibold">
          اسم العميل
          <input name="customerName" required className="dashboard-field mt-2" placeholder="مثال: خالد" />
        </label>
        <label className="block text-sm font-semibold">
          جوال العميل
          <input
            name="customerPhone"
            required
            inputMode="numeric"
            maxLength={10}
            pattern="05[0-9]{8}"
            placeholder="05xxxxxxxx"
            onInput={(event) => {
              event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 10);
            }}
            className="dashboard-field mt-2"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">
            الوقت
            <input dir="ltr" lang="en" name="time" type="time" required className="dashboard-field mt-2" />
          </label>
          <label className="block text-sm font-semibold">
            المدة (دقيقة)
            <input lang="en" name="durationMinutes" type="number" min={5} max={480} step={5} defaultValue={30} className="dashboard-field mt-2" />
          </label>
        </div>
        <label className="block text-sm font-semibold">
          الحلاق (اختياري)
          <select name="barberId" defaultValue="" className="dashboard-field mt-2">
            <option value="">بلا تحديد</option>
            {salonBarbers.map((barber) => (
              <option key={barber.id} value={barber.id}>
                {barber.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          ملاحظة
          <input name="notes" className="dashboard-field mt-2" placeholder="اختياري" />
        </label>
        <button disabled={loading || !salonId} className="dashboard-button-gold w-full">
          {loading ? "جاري الحفظ..." : "حفظ الموعد"}
        </button>
      </form>

      <div className="dashboard-panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-salon-line/70 px-5 py-4">
          <h2 className="text-lg font-bold tracking-tight">مواعيد اليوم</h2>
          <span className="rounded-full bg-salon-mist px-3 py-1 text-xs font-bold text-salon-charcoal">
            {active.length} نشط من {appointments.length}
          </span>
        </div>

        <div className="divide-y divide-salon-line/70">
          {appointments.map((appointment) => {
            const isPending = pendingId === appointment.id;
            const closed = appointment.status === "COMPLETED" || appointment.status === "CANCELLED" || appointment.status === "NO_SHOW";

            return (
              <article key={appointment.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[110px_1fr_auto] lg:items-center">
                <div className="text-lg font-bold tabular-nums">
                  {timeFormatter.format(new Date(appointment.startAt))}
                  <span className="block text-xs font-semibold text-salon-charcoal/70">{appointment.durationMinutes} دقيقة</span>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{appointment.customerName}</span>
                    <StatusBadge status={appointment.status} label={appointment.statusLabel} />
                  </div>
                  <p className="mt-1 text-xs font-semibold text-salon-charcoal" dir="ltr">
                    {appointment.customerPhone}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-salon-charcoal/80">
                    {appointment.barber?.name ?? "بلا حلاق محدد"}
                    {appointment.salon ? ` · ${appointment.salon.name}` : ""}
                    {appointment.notes ? ` · ${appointment.notes}` : ""}
                  </p>
                </div>

                {appointment.status === "NO_SHOW" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => void correctNoShow(appointment)}
                    className="dashboard-button-soft px-3 py-2 text-xs"
                  >
                    تصحيح الحالة
                  </button>
                ) : closed ? null : (
                  <div className="flex flex-wrap gap-2">
                    {appointment.status === "BOOKED" ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => void setStatus(appointment, "ARRIVED")}
                        className="dashboard-button px-3 py-2 text-xs"
                      >
                        وصل
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => void markNoShow(appointment)}
                      className="dashboard-button-soft px-3 py-2 text-xs"
                    >
                      لم يحضر
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => void cancelAppointment(appointment)}
                      className="dashboard-danger-button px-3 py-2 text-xs"
                    >
                      إلغاء
                    </button>
                  </div>
                )}
              </article>
            );
          })}

          {appointments.length === 0 ? (
            <div className="p-5"><InlineEmpty icon="🗓️" title="لا توجد مواعيد في هذا اليوم" hint="احجز موعدًا من النموذج المجاور، أو استقبل العميل بلا موعد كالمعتاد." /></div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: Appointment["status"]; label: string }) {
  const tone = {
    BOOKED: "bg-salon-mist text-salon-charcoal ring-salon-line",
    ARRIVED: "bg-amber-50 text-amber-700 ring-amber-200/70",
    COMPLETED: "bg-green-50 text-green-700 ring-green-200/70",
    CANCELLED: "bg-red-50 text-red-700 ring-red-200/70",
    NO_SHOW: "bg-red-50 text-red-700 ring-red-200/70",
  }[status];

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tone}`}>{label}</span>;
}
