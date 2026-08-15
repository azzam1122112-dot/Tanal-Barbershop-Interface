"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import type { BarberAppointment } from "@/components/barber/appointments-panel";
import { parseDateKeyParts, RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";
import { safeFetch } from "@/lib/http/safe-fetch";

type SlotStatus = "AVAILABLE" | "BOOKED" | "TOO_SOON" | "OFF_DUTY";
type RescheduleSlot = {
  startAt: string;
  minuteOfDay: number;
  status: SlotStatus;
};
type RescheduleDay = {
  date: string;
  weekday: number;
  closed: boolean;
  slots: RescheduleSlot[];
};

const dayFormatter = new Intl.DateTimeFormat("ar-SA", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const currentFormatter = new Intl.DateTimeFormat("ar-SA", {
  timeZone: RIYADH_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function BarberRescheduleDialog({
  appointment,
  onClose,
  onChanged,
}: {
  appointment: BarberAppointment;
  onClose: () => void;
  onChanged: (appointment: BarberAppointment) => void;
}) {
  const [days, setDays] = useState<RescheduleDay[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStartAt, setSelectedStartAt] = useState("");
  const [leadMinutes, setLeadMinutes] = useState(120);
  const [currentStartAt, setCurrentStartAt] = useState(appointment.startAt);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await safeFetch(`/api/barber/appointments/${appointment.id}/reschedule`, {
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => ({}))) as {
          days?: RescheduleDay[];
          leadMinutes?: number;
          currentStartAt?: string;
          message?: string;
        };
        if (!response.ok || !data.days) {
          setError(data.message ?? "تعذر جلب الأوقات المتاحة");
          return;
        }

        setDays(data.days);
        setLeadMinutes(data.leadMinutes ?? 120);
        setCurrentStartAt(data.currentStartAt ?? appointment.startAt);
        const firstAvailable = data.days.find((day) =>
          day.slots.some((slot) => slot.status === "AVAILABLE" && slot.startAt !== data.currentStartAt),
        );
        setSelectedDate(firstAvailable?.date ?? data.days[0]?.date ?? "");
      } catch (loadError) {
        if ((loadError as { name?: string }).name !== "AbortError") {
          setError("تعذر الاتصال بالخادم، حاول مرة أخرى");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [appointment.id, appointment.startAt]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const selectedDay = useMemo(
    () => days.find((day) => day.date === selectedDate) ?? null,
    [days, selectedDate],
  );
  const availableSlots = selectedDay?.slots.filter((slot) => slot.status === "AVAILABLE") ?? [];

  async function save() {
    if (!selectedStartAt || selectedStartAt === currentStartAt) return;
    setSaving(true);
    setError("");
    try {
      const response = await safeFetch(`/api/barber/appointments/${appointment.id}/reschedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt: selectedStartAt }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        appointment?: BarberAppointment;
        message?: string;
      };
      if (!response.ok || !data.appointment) {
        setError(data.message ?? "تعذر تغيير الموعد");
        return;
      }
      onChanged(data.appointment);
    } catch {
      setError("تعذر الاتصال بالخادم، حاول مرة أخرى");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-salon-ink/60 px-3 pt-4 backdrop-blur-sm sm:items-center sm:p-5"
      onClick={() => (saving ? undefined : onClose())}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-title"
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92svh] w-full overflow-y-auto rounded-t-3xl border border-white/20 bg-white shadow-[0_30px_90px_rgba(16,25,22,0.35)] sm:max-w-lg sm:rounded-3xl"
      >
        <header className="relative overflow-hidden bg-sidebar-onyx px-5 pb-5 pt-6 text-white">
          <span className="absolute inset-x-0 top-0 h-1 bg-gold-sheen" aria-hidden="true" />
          <span className="absolute -left-10 -top-16 h-36 w-36 rounded-full bg-violet-500/25 blur-3xl" aria-hidden="true" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black text-salon-goldlight">إدارة الحجز</p>
              <h2 id="reschedule-title" className="mt-1 text-2xl font-black">تغيير موعد {appointment.customerName}</h2>
              <p className="mt-2 text-xs font-semibold text-white/60">
                الموعد الحالي: {currentFormatter.format(new Date(currentStartAt))}
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              aria-label="إغلاق"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-50"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="p-5">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs font-bold leading-6 text-violet-950">
            تظهر الأوقات المتاحة فقط، مع مراعاة دوامك وحجوزاتك ومهلة {formatLead(leadMinutes)} من الآن.
          </div>

          {loading ? (
            <div className="space-y-3 py-6" aria-label="جاري تحميل الأوقات">
              <div className="h-16 animate-pulse rounded-2xl bg-salon-mist" />
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="h-12 animate-pulse rounded-xl bg-salon-mist" />
                ))}
              </div>
            </div>
          ) : error && days.length === 0 ? (
            <div className="my-5 space-y-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-bold leading-6 text-red-800">
              <p>{error}</p>
              <button type="button" onClick={onClose} className="barber-ghost-button min-h-12 w-full bg-white">العودة للمواعيد</button>
            </div>
          ) : (
            <>
              <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
                {days.map((day) => {
                  const count = day.slots.filter((slot) => slot.status === "AVAILABLE" && slot.startAt !== currentStartAt).length;
                  const active = day.date === selectedDate;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      disabled={count === 0}
                      onClick={() => {
                        setSelectedDate(day.date);
                        setSelectedStartAt("");
                        setError("");
                      }}
                      className={`min-w-[108px] rounded-2xl border px-3 py-3 text-center transition disabled:opacity-40 ${
                        active
                          ? "border-violet-700 bg-violet-700 text-white shadow-md"
                          : "border-salon-line bg-white text-salon-ink"
                      }`}
                    >
                      <span className="block text-xs font-black">{formatDay(day.date)}</span>
                      <span className={`mt-1 block text-[10px] font-bold ${active ? "text-white/65" : "text-salon-charcoal/55"}`}>
                        {count > 0 ? `${count} وقت متاح` : "لا يوجد وقت"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-salon-ink">اختر الوقت الجديد</h3>
                  <span className="text-[11px] font-bold text-salon-charcoal/55">{availableSlots.length} متاح</span>
                </div>
                {availableSlots.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {availableSlots.map((slot) => {
                      const current = slot.startAt === currentStartAt;
                      const selected = slot.startAt === selectedStartAt;
                      return (
                        <button
                          key={slot.startAt}
                          type="button"
                          disabled={current}
                          onClick={() => {
                            setSelectedStartAt(slot.startAt);
                            setError("");
                          }}
                          className={`min-h-12 rounded-xl border px-2 text-sm font-black tabular-nums transition disabled:cursor-not-allowed ${
                            selected
                              ? "border-violet-700 bg-violet-700 text-white shadow-md"
                              : current
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-salon-line bg-white text-salon-ink hover:border-violet-300 hover:bg-violet-50"
                          }`}
                        >
                          {formatMinute(slot.minuteOfDay)}
                          {current ? <span className="block text-[9px]">الحالي</span> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 rounded-2xl bg-salon-mist px-4 py-5 text-center text-sm font-bold text-salon-charcoal/65">
                    {days.some((day) => day.slots.some((slot) => slot.status === "AVAILABLE" && slot.startAt !== currentStartAt))
                      ? "لا توجد أوقات متاحة في هذا اليوم، اختر يومًا آخر."
                      : "لا توجد أوقات بديلة ضمن المدة المتاحة حاليًا. يمكنك العودة للمواعيد والمحاولة لاحقًا."}
                  </p>
                )}
              </div>

              {error ? (
                <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
                  {error}
                </p>
              ) : null}
            </>
          )}

          <div className="sticky bottom-0 -mx-5 mt-6 border-t border-salon-line bg-white/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur">
            <button
              type="button"
              disabled={loading || saving || !selectedStartAt || selectedStartAt === currentStartAt}
              onClick={() => void save()}
              className="barber-primary-button min-h-14 w-full text-base"
            >
              {saving ? "جاري حفظ الموعد..." : "تأكيد تغيير الموعد"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatDay(dateKey: string) {
  const { year, month, day } = parseDateKeyParts(dateKey);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(12, 0, 0, 0);
  return dayFormatter.format(date);
}

function formatMinute(minute: number) {
  const date = new Date(Date.UTC(2000, 0, 1, Math.floor(minute / 60) - 3, minute % 60));
  return new Intl.DateTimeFormat("ar-SA", { timeZone: RIYADH_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatLead(minutes: number) {
  if (minutes % 60 === 0) return `${minutes / 60} ساعة`;
  return `${Math.floor(minutes / 60)} ساعة و${minutes % 60} دقيقة`;
}
