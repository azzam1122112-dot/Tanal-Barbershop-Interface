"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * حجز موعد من بوابة العميل.
 *
 * الشاشة تعرض **الفترات المتاحة فقط** — لا تُظهر المحجوز ولا اسم من حجزه،
 * فلا يُستدل من صفحة عميل على جدول عميل آخر.
 */

type BookableBarber = { id: string; name: string };

type BookableSalon = {
  id: string;
  name: string;
  slotMinutes: number;
  horizonDays: number;
  closedWeekdays: number[];
  barbers: BookableBarber[];
};

type BookingSlot = { startAt: string; minuteOfDay: number };
type BookingDay = { date: string; weekday: number; closed: boolean; slots: BookingSlot[] };

type AppointmentRow = {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: string;
  statusLabel: string;
  salonName: string;
  barberName: string | null;
  canCancel: boolean;
};

const WEEKDAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** `2026-08-09` → «الأحد ٩ أغسطس» بلا إنشاء Date من نص ISO (يتفادى انزياح المنطقة). */
function formatDayLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return {
    weekday: WEEKDAY_NAMES[date.getDay()],
    day: new Intl.DateTimeFormat("ar-SA-u-nu-latn", { day: "numeric", month: "short" }).format(date),
  };
}

function formatSlotTime(minuteOfDay: number) {
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const suffix = hour24 < 12 ? "ص" : "م";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatAppointment(startAt: string) {
  const date = new Date(startAt);
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function PortalBooking({
  token,
  salons,
  initialAppointments,
}: {
  token: string;
  salons: BookableSalon[];
  initialAppointments: AppointmentRow[];
}) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [salonId, setSalonId] = useState(salons[0]?.id ?? "");
  const [barberId, setBarberId] = useState<string>("");
  const [days, setDays] = useState<BookingDay[]>([]);
  const [activeDate, setActiveDate] = useState<string>("");
  const [selected, setSelected] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [confirmation, setConfirmation] = useState<string>("");

  const salon = salons.find((item) => item.id === salonId) ?? null;

  const loadSlots = useCallback(async () => {
    if (!salonId) return;
    setLoadingSlots(true);
    setError("");
    try {
      const query = new URLSearchParams({ salonId });
      if (barberId) query.set("barberId", barberId);
      const response = await fetch(`/api/public/portal/${token}/slots?${query.toString()}`);
      const data = (await response.json().catch(() => ({}))) as {
        days?: BookingDay[];
        message?: string;
      };
      if (!response.ok) {
        setDays([]);
        setError(data.message ?? "تعذر جلب الأوقات المتاحة");
        return;
      }
      const nextDays = data.days ?? [];
      setDays(nextDays);
      // نثبّت أول يوم فيه فترة فعلية — القفز ليوم فارغ يبدو كعطل.
      const firstOpen = nextDays.find((day) => !day.closed && day.slots.length > 0);
      setActiveDate(firstOpen?.date ?? nextDays[0]?.date ?? "");
    } catch {
      setDays([]);
      setError("تعذر الاتصال. تحقق من اتصالك وحاول مجددًا.");
    } finally {
      setLoadingSlots(false);
    }
  }, [barberId, salonId, token]);

  useEffect(() => {
    setSelected("");
    void loadSlots();
  }, [loadSlots]);

  // تبديل الفرع يُبطل اختيار حلاق من فرع آخر.
  useEffect(() => {
    setBarberId("");
  }, [salonId]);

  async function submitBooking() {
    if (!selected || !salonId) return;
    setSubmitting(true);
    setError("");
    setConfirmation("");

    try {
      const response = await fetch(`/api/public/portal/${token}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, barberId: barberId || null, startAt: selected }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        appointment?: AppointmentRow;
        message?: string;
      };

      if (!response.ok || !data.appointment) {
        setError(data.message ?? "تعذر تأكيد الحجز");
        // الفترة قد تكون حُجزت بين العرض والضغط — نعيد تحميل الشبكة.
        void loadSlots();
        return;
      }

      setAppointments((current) => [...current, data.appointment!].sort((a, b) => a.startAt.localeCompare(b.startAt)));
      setConfirmation(`تم حجز موعدك: ${formatAppointment(data.appointment.startAt)}`);
      setSelected("");
      void loadSlots();
    } catch {
      setError("تعذر الاتصال. تحقق من اتصالك وحاول مجددًا.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelAppointment(id: string) {
    setError("");
    setConfirmation("");
    try {
      const response = await fetch(`/api/public/portal/${token}/appointments/${id}/cancel`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        appointment?: AppointmentRow;
        message?: string;
      };
      if (!response.ok || !data.appointment) {
        setError(data.message ?? "تعذر إلغاء الموعد");
        return;
      }
      setAppointments((current) =>
        current.map((item) => (item.id === id ? data.appointment! : item)),
      );
      setConfirmation("تم إلغاء الموعد.");
      void loadSlots();
    } catch {
      setError("تعذر الاتصال. تحقق من اتصالك وحاول مجددًا.");
    }
  }

  const upcoming = appointments.filter(
    (item) => item.status === "BOOKED" || item.status === "ARRIVED",
  );
  const activeDay = days.find((day) => day.date === activeDate) ?? null;

  return (
    <div className="space-y-4">
      {upcoming.length > 0 ? (
        <section className="rounded-2xl border border-salon-forest/25 bg-salon-forest/[0.07] px-5 py-5">
          <h2 className="text-base font-bold">مواعيدك القادمة</h2>
          <ul className="mt-3 space-y-3">
            {upcoming.map((appointment) => (
              <li key={appointment.id} className="rounded-2xl bg-white px-4 py-3">
                <p className="text-sm font-black">{formatAppointment(appointment.startAt)}</p>
                <p className="mt-1 text-xs font-semibold text-salon-charcoal">
                  {appointment.salonName}
                  {appointment.barberName ? ` · ${appointment.barberName}` : ""}
                  {` · ${appointment.statusLabel}`}
                </p>
                {appointment.canCancel ? (
                  <button
                    type="button"
                    onClick={() => cancelAppointment(appointment.id)}
                    className="mt-3 w-full rounded-xl border border-salon-ruby/30 py-2 text-xs font-black text-salon-ruby"
                  >
                    إلغاء الموعد
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {salons.length === 0 ? null : (
        <section className="barber-card px-5 py-5">
          <h2 className="text-base font-bold">احجز موعدك</h2>

          {salons.length > 1 ? (
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-black text-salon-charcoal">الفرع</span>
              <select
                value={salonId}
                onChange={(event) => setSalonId(event.target.value)}
                className="w-full rounded-2xl border border-salon-line bg-salon-pearl px-4 py-3 text-sm font-bold"
              >
                {salons.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {salon && salon.barbers.length > 0 ? (
            <label className="mt-4 block">
              <span className="mb-2 block text-xs font-black text-salon-charcoal">الحلاق</span>
              <select
                value={barberId}
                onChange={(event) => setBarberId(event.target.value)}
                className="w-full rounded-2xl border border-salon-line bg-salon-pearl px-4 py-3 text-sm font-bold"
              >
                <option value="">أي حلاق متاح</option>
                {salon.barbers.map((barber) => (
                  <option key={barber.id} value={barber.id}>
                    {barber.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="mt-5">
            <span className="mb-2 block text-xs font-black text-salon-charcoal">اليوم</span>
            <div className="table-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
              {days.map((day) => {
                const label = formatDayLabel(day.date);
                const disabled = day.closed || day.slots.length === 0;
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setActiveDate(day.date);
                      setSelected("");
                    }}
                    className={`min-w-[4.5rem] shrink-0 rounded-2xl border px-3 py-2.5 text-center transition ${
                      day.date === activeDate
                        ? "border-salon-ink bg-salon-ink text-white"
                        : disabled
                          ? "border-salon-line/60 bg-salon-mist text-salon-charcoal/40"
                          : "border-salon-line bg-white text-salon-charcoal"
                    }`}
                  >
                    <span className="block text-[0.7rem] font-bold">{label.weekday}</span>
                    <span className="mt-0.5 block text-xs font-black tabular-nums">{label.day}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <span className="mb-2 block text-xs font-black text-salon-charcoal">الوقت</span>
            {loadingSlots ? (
              <p className="rounded-2xl bg-salon-mist px-4 py-6 text-center text-sm font-bold text-salon-charcoal">
                جاري جلب الأوقات...
              </p>
            ) : !activeDay || activeDay.closed ? (
              <p className="rounded-2xl bg-salon-mist px-4 py-6 text-center text-sm font-bold text-salon-charcoal">
                الفرع مغلق في هذا اليوم.
              </p>
            ) : activeDay.slots.length === 0 ? (
              <p className="rounded-2xl bg-salon-mist px-4 py-6 text-center text-sm font-bold text-salon-charcoal">
                لا توجد أوقات متاحة في هذا اليوم. جرّب يومًا آخر.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {activeDay.slots.map((slot) => (
                  <button
                    key={slot.startAt}
                    type="button"
                    onClick={() => setSelected(slot.startAt)}
                    className={`rounded-xl border py-2.5 text-xs font-black tabular-nums transition ${
                      selected === slot.startAt
                        ? "border-salon-forest bg-salon-forest text-white"
                        : "border-salon-line bg-white text-salon-charcoal"
                    }`}
                  >
                    {formatSlotTime(slot.minuteOfDay)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>
          ) : null}
          {confirmation ? (
            <p className="mt-4 rounded-2xl bg-salon-forest/10 px-4 py-3 text-sm font-bold text-salon-forest">
              {confirmation}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!selected || submitting}
            onClick={submitBooking}
            className="mt-5 h-14 w-full rounded-2xl bg-salon-ink text-lg font-black text-white disabled:opacity-40"
          >
            {submitting ? "جاري التأكيد..." : "تأكيد الحجز"}
          </button>
        </section>
      )}
    </div>
  );
}
