"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * حجز موعد من بوابة العميل.
 *
 * الشاشة تعرض حالة الوقت (متاح/محجوز/قريب) بلا اسم العميل المحجوز،
 * فيفهم العميل الجدول من دون كشف أي بيانات شخصية لعميل آخر.
 */

type BookableBarber = {
  id: string;
  name: string;
  openMinute: number;
  closeMinute: number;
  closedWeekdays: number[];
  inheritsSalonSchedule: boolean;
};

type BookableSalon = {
  id: string;
  name: string;
  slotMinutes: number;
  horizonDays: number;
  closedWeekdays: number[];
  barbers: BookableBarber[];
};

type BookingSlotStatus = "AVAILABLE" | "BOOKED" | "TOO_SOON" | "OFF_DUTY";
type BookingSlot = {
  startAt: string;
  minuteOfDay: number;
  status: BookingSlotStatus;
  barbers: { barberId: string; status: BookingSlotStatus }[];
};
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
  if (minuteOfDay === 24 * 60) return "12:00 ص";
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const suffix = hour24 < 12 ? "ص" : "م";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatLeadDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourLabel = hours === 1 ? "ساعة" : hours === 2 ? "ساعتين" : `${hours} ساعات`;
  if (remainder === 0) return hourLabel;
  return `${hourLabel} و${remainder} دقيقة`;
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
  const [leadMinutes, setLeadMinutes] = useState(120);
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
      const response = await fetch(`/api/public/portal/${token}/slots?${query.toString()}`);
      const data = (await response.json().catch(() => ({}))) as {
        days?: BookingDay[];
        leadMinutes?: number;
        message?: string;
      };
      if (!response.ok) {
        setDays([]);
        setError(data.message ?? "تعذر جلب الأوقات المتاحة");
        return;
      }
      const nextDays = data.days ?? [];
      setDays(nextDays);
      setLeadMinutes(data.leadMinutes ?? 120);
      // نثبّت أول يوم فيه فترة فعلية — القفز ليوم فارغ يبدو كعطل.
      const firstOpen = nextDays.find(
        (day) => !day.closed && day.slots.some((slot) => slot.status === "AVAILABLE"),
      );
      setActiveDate(firstOpen?.date ?? nextDays[0]?.date ?? "");
    } catch {
      setDays([]);
      setError("تعذر الاتصال. تحقق من اتصالك وحاول مجددًا.");
    } finally {
      setLoadingSlots(false);
    }
  }, [salonId, token]);

  useEffect(() => {
    setSelected("");
    void loadSlots();
  }, [loadSlots]);

  // تبديل الفرع يُبطل اختيار حلاق من فرع آخر.
  useEffect(() => {
    const nextSalon = salons.find((item) => item.id === salonId);
    setBarberId(nextSalon?.barbers.length === 1 ? nextSalon.barbers[0].id : "");
  }, [salonId, salons]);

  useEffect(() => {
    setSelected("");
  }, [barberId]);

  async function submitBooking() {
    if (!selected || !salonId || !barberId) return;
    setSubmitting(true);
    setError("");
    setConfirmation("");

    try {
      const response = await fetch(`/api/public/portal/${token}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, barberId, startAt: selected }),
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
  const activeBarber = salon?.barbers.find((barber) => barber.id === barberId) ?? null;
  const visibleSlots = activeDay && barberId
    ? activeDay.slots
        .map((slot) => ({
          ...slot,
          barberStatus: slot.barbers.find((barber) => barber.barberId === barberId)?.status ?? "OFF_DUTY",
        }))
        .filter((slot) => slot.barberStatus !== "OFF_DUTY")
    : [];

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

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-salon-gold/30 bg-salon-gold/10 px-4 py-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-salon-ink text-xs font-bold text-white" aria-hidden="true">
              {leadMinutes === 120 ? "+2" : `+${leadMinutes}د`}
            </span>
            <div>
              <p className="text-sm font-bold text-salon-ink">الحجز يبدأ بعد ساعتين من الآن</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-salon-charcoal/70">
                نعرض تلقائيًا أول وقت يسمح به النظام بعد {formatLeadDuration(leadMinutes)} أو أكثر.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <span className="mb-2 block text-xs font-black text-salon-charcoal">اليوم</span>
            <div className="table-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
              {days.map((day) => {
                const label = formatDayLabel(day.date);
                const disabled = day.closed;
                const availableCount = day.slots.filter((slot) => slot.status === "AVAILABLE").length;
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
                    <span className="mt-1 block text-[0.6rem] font-bold opacity-70">
                      {day.closed ? "مغلق" : availableCount > 0 ? `${availableCount} متاح` : "مكتمل"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {salon && salon.barbers.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="block text-xs font-black text-salon-charcoal">اختر الحلاق</span>
                <span className="text-[0.65rem] font-bold text-salon-charcoal/60">التوافر لليوم المختار</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {salon.barbers.map((barber) => {
                  const statuses = activeDay?.slots.map(
                    (slot) => slot.barbers.find((item) => item.barberId === barber.id)?.status ?? "OFF_DUTY",
                  ) ?? [];
                  const availableCount = statuses.filter((status) => status === "AVAILABLE").length;
                  const bookedCount = statuses.filter((status) => status === "BOOKED").length;
                  const offToday = activeDay ? barber.closedWeekdays.includes(activeDay.weekday) : false;
                  const active = barberId === barber.id;
                  return (
                    <button
                      key={barber.id}
                      type="button"
                      onClick={() => setBarberId(barber.id)}
                      className={`rounded-2xl border p-3 text-right transition ${
                        active
                          ? "border-salon-forest bg-salon-forest text-white shadow-sm"
                          : "border-salon-line bg-white text-salon-ink hover:border-salon-forest/40"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-bold">{barber.name}</span>
                        <span
                          className={`rounded-full px-2 py-1 text-[0.6rem] font-bold ${
                            active
                              ? "bg-white/15 text-white"
                              : availableCount > 0
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-salon-mist text-salon-charcoal/70"
                          }`}
                        >
                          {offToday ? "إجازة" : availableCount > 0 ? `${availableCount} متاح` : "مكتمل"}
                        </span>
                      </span>
                      <span className={`mt-1.5 block text-[0.68rem] font-semibold ${active ? "text-white/75" : "text-salon-charcoal/65"}`}>
                        {formatSlotTime(barber.openMinute)} – {formatSlotTime(barber.closeMinute)}
                        {bookedCount > 0 ? ` · ${bookedCount} محجوز` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="block text-xs font-black text-salon-charcoal">الوقت</span>
              {activeBarber ? (
                <span className="text-[0.65rem] font-bold text-salon-charcoal/60">جدول {activeBarber.name}</span>
              ) : null}
            </div>
            {loadingSlots ? (
              <p className="rounded-2xl bg-salon-mist px-4 py-6 text-center text-sm font-bold text-salon-charcoal">
                جاري جلب الأوقات...
              </p>
            ) : !activeDay || activeDay.closed ? (
              <p className="rounded-2xl bg-salon-mist px-4 py-6 text-center text-sm font-bold text-salon-charcoal">
                الفرع مغلق في هذا اليوم.
              </p>
            ) : !barberId ? (
              <p className="rounded-2xl border border-dashed border-salon-line bg-salon-pearl px-4 py-6 text-center text-sm font-bold text-salon-charcoal">
                اختر الحلاق أولًا لعرض أوقاته المتاحة والمحجوزة.
              </p>
            ) : visibleSlots.length === 0 ? (
              <p className="rounded-2xl bg-salon-mist px-4 py-6 text-center text-sm font-bold text-salon-charcoal">
                الحلاق في إجازة أو خارج الدوام في هذا اليوم.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {visibleSlots.map((slot) => {
                  const available = slot.barberStatus === "AVAILABLE";
                  const booked = slot.barberStatus === "BOOKED";
                  const tooSoon = slot.barberStatus === "TOO_SOON";
                  return (
                    <button
                      key={slot.startAt}
                      type="button"
                      disabled={!available}
                      onClick={() => setSelected(slot.startAt)}
                      className={`rounded-xl border px-1 py-2.5 text-xs font-black tabular-nums transition ${
                        selected === slot.startAt
                          ? "border-salon-forest bg-salon-forest text-white"
                          : booked
                            ? "border-red-100 bg-red-50 text-red-500"
                            : tooSoon
                              ? "border-amber-100 bg-amber-50 text-amber-700"
                              : "border-salon-line bg-white text-salon-charcoal hover:border-salon-forest/45"
                      } disabled:cursor-not-allowed`}
                    >
                      <span className="block">{formatSlotTime(slot.minuteOfDay)}</span>
                      <span className="mt-1 block text-[0.58rem] font-bold opacity-75">
                        {booked ? "محجوز" : tooSoon ? "قبل المهلة" : "متاح"}
                      </span>
                    </button>
                  );
                })}
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
            disabled={!selected || !barberId || submitting}
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
