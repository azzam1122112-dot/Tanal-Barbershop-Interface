"use client";

import { useCallback, useEffect, useState } from "react";
import { parseDateKeyParts, RIYADH_TIME_ZONE } from "@/lib/datetime/riyadh";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatAppointmentSpan, formatDurationLabel } from "@/lib/appointments/duration-format";
import { arriveByLabel } from "@/components/public/next-appointment-card";

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

type BookableService = {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
};

type BookableSalon = {
  id: string;
  name: string;
  slotMinutes: number;
  horizonDays: number;
  closedWeekdays: number[];
  /** حدّ المواعيد القائمة للعميل في هذا الفرع. */
  maxActivePerCustomer: number;
  barbers: BookableBarber[];
  services: BookableService[];
};

type BookingWindow = {
  openMinute: number;
  closeMinute: number;
  /** فرع لا يغلق: الموعد يعبر منتصف الليل ولا تُقصّ آخر ساعة من اليوم. */
  continuous: boolean;
  /** آخر دقيقة يجوز أن يبدأ عندها موعد بهذه المدة. */
  lastStartMinute: number;
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
  services: { serviceId: string; serviceName: string }[];
  canCancel: boolean;
};

type BookingPolicy = {
  noShowCount: number;
  maxNoShows: number;
  remainingBeforeBlock: number;
  blocked: boolean;
  blockedAt: string | null;
  reason: string | null;
};

const WEEKDAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** `2026-08-09` → «الأحد ٩ أغسطس» بلا إنشاء Date من نص ISO (يتفادى انزياح المنطقة). */
function formatDayLabel(dateKey: string) {
  const { year, month, day } = parseDateKeyParts(dateKey);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(12, 0, 0, 0);
  return {
    weekday: WEEKDAY_NAMES[date.getUTCDay()],
    day: new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
    }).format(date),
  };
}

/**
 * عدد المواعيد بصيغته العربية الصحيحة: المفرد والمثنى وجمع القلة والكثرة.
 * «2 مواعيد» تُقرأ ترجمةً آلية، والبوابة يقرأها العميل لا المطوّر.
 */
function appointmentsCount(count: number) {
  if (count === 1) return "موعد واحد";
  if (count === 2) return "موعدان";
  if (count <= 10) return `${count} مواعيد`;
  return `${count} موعدًا`;
}

function formatSlotTime(minuteOfDay: number) {
  if (minuteOfDay === 24 * 60) return "12:00 ص";
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const suffix = hour24 < 12 ? "ص" : "م";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/**
 * سطر يشرح حدّ الشبكة: لماذا لا تظهر أوقات متأخرة، ومتى لا يوجد حدّ أصلًا.
 *
 * لا يُعرض إن كانت المدة المحجوزة هي الفترة الافتراضية — عندها الشبكة كاملة
 * ولا شيء اختفى ليُشرح، وسطرٌ بلا سبب ضجيج.
 */
function buildWindowNotice(
  window: BookingWindow | null,
  durationMinutes: number,
  slotMinutes: number,
) {
  if (!window || durationMinutes <= 0) return "";
  if (window.continuous) {
    return durationMinutes > slotMinutes
      ? `الفرع يستقبل على مدار الساعة، والموعد قد يمتدّ بعد منتصف الليل — مدة خدماتك ${formatDurationLabel(durationMinutes)}.`
      : "";
  }
  if (durationMinutes <= slotMinutes) return "";
  return `خدماتك تحتاج ${formatDurationLabel(durationMinutes)} متواصلة، فآخر موعد يبدأ ${formatSlotTime(
    window.lastStartMinute,
  )} ليكتمل قبل إغلاق الفرع ${formatSlotTime(window.closeMinute)}.`;
}

function formatLeadDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  // أقل من ساعة يُصاغ بالدقائق وحدها: الفرع الذي مهلته ثلاثون دقيقة كان يقرأ
  // عميله «0 ساعات و30 دقيقة».
  if (hours === 0) return `${remainder} دقيقة`;
  const hourLabel = hours === 1 ? "ساعة" : hours === 2 ? "ساعتين" : `${hours} ساعات`;
  if (remainder === 0) return hourLabel;
  return `${hourLabel} و${remainder} دقيقة`;
}

/**
 * ترويسة خطوة في نموذج الحجز.
 *
 * الحجز أربع خطوات متسلسلة (خدمات ← يوم ← حلاق ← وقت) وكانت تُعرض أقسامًا
 * متساوية بلا ترتيب معلن، فيقرؤها العميل كوميضٍ من الحقول لا كمسار. والترقيم
 * يُحسب لا يُكتب: الفرع يظهر لمن له فرعان فأكثر، والحلاق لمن فرعه فيه حلاقون.
 */
function Step({ number, title, hint }: { number: number; title: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-salon-ink text-[0.6rem] font-black text-white"
        >
          {number}
        </span>
        <span className="text-xs font-black text-salon-charcoal">{title}</span>
      </span>
      {hint ? <span className="shrink-0 text-[0.65rem] font-bold text-salon-charcoal/60">{hint}</span> : null}
    </div>
  );
}

function formatAppointment(startAt: string) {
  const date = new Date(startAt);
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: RIYADH_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * إيصال الحجز — ما يحتاجه العميل ليعرف أن الأمر تمّ وماذا يفعل بعده.
 *
 * يحمل ما كان السطر النصّي يُسقطه: الحلاق والفرع والخدمات ووقت الحضور المطلوب.
 */
function BookingConfirmation({
  appointment,
  arriveEarlyMinutes,
  onBookAnother,
}: {
  appointment: AppointmentRow;
  arriveEarlyMinutes: number;
  onBookAnother: () => void;
}) {
  const arrive = arriveByLabel(appointment.startAt, arriveEarlyMinutes);

  return (
    <section
      className="overflow-hidden rounded-2xl border border-salon-forest/30 bg-white shadow-[var(--shadow-md)]"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 border-b border-salon-forest/15 bg-salon-forest/[0.08] px-5 py-4">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-salon-forest text-lg font-black text-white"
        >
          ✓
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-salon-ink">تم تأكيد حجزك</h2>
          <p className="mt-0.5 text-xs font-semibold text-salon-charcoal/70">
            موعدك محفوظ باسمك — لا حاجة لتأكيد آخر.
          </p>
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="text-base font-bold text-salon-ink">{formatAppointment(appointment.startAt)}</p>
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
                key={service.serviceId}
                className="rounded-xl bg-salon-forest/[0.07] px-2.5 py-1 text-[11px] font-bold text-salon-forest"
              >
                {service.serviceName}
              </li>
            ))}
          </ul>
        ) : null}

        {arrive ? (
          <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-salon-gold/35 bg-salon-gold/10 px-3.5 py-3 text-xs font-bold leading-5 text-salon-ink">
            <span aria-hidden="true" className="shrink-0">
              ⏰
            </span>
            <span>
              احضر قبل موعدك بـ{arrive.minutes} دقائق —{" "}
              <span className="text-salon-forest" dir="ltr">
                {arrive.clock}
              </span>
              <span className="mt-0.5 block font-semibold text-salon-charcoal/70">
                التأخّر قد يعني تقليص الخدمة أو تأجيلها.
              </span>
            </span>
          </p>
        ) : null}

        <p className="mt-3 text-xs font-semibold leading-5 text-salon-charcoal/70">
          إن تعذّر حضورك ألغِ الموعد من هذه الصفحة — عدم الحضور لموعدين يُعلّق الحجز الإلكتروني.
        </p>

        <button
          type="button"
          onClick={onBookAnother}
          className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl border border-salon-line bg-salon-pearl text-sm font-black text-salon-ink transition hover:border-salon-forest/40"
        >
          حجز موعد آخر
        </button>
      </div>
    </section>
  );
}

export function PortalBooking({
  token,
  salons,
  initialAppointments,
  bookingPolicy,
  arriveEarlyMinutes,
}: {
  token: string;
  salons: BookableSalon[];
  initialAppointments: AppointmentRow[];
  bookingPolicy: BookingPolicy;
  arriveEarlyMinutes: number;
}) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [salonId, setSalonId] = useState(salons[0]?.id ?? "");
  const [barberId, setBarberId] = useState<string>("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [days, setDays] = useState<BookingDay[]>([]);
  const [activeDate, setActiveDate] = useState<string>("");
  const [selected, setSelected] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [leadMinutes, setLeadMinutes] = useState(120);
  // المدة التي حُسبت بها الشبكة المعروضة — من الخادم لا من حساب الواجهة.
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [bookingWindow, setBookingWindow] = useState<BookingWindow | null>(null);
  const [estimatedTotal, setEstimatedTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // خطآن لا واحد: خطأ **الإجراء** (تأكيد/إلغاء) وخطأ **جلب الشبكة**. كانا حالة
  // واحدة، وكل فشل حجز يستدعي `loadSlots` بعده مباشرة — فتمسح بدايتُها الرسالةَ
  // في نفس الدورة، ويضغط العميل «تأكيد» فلا يرى شيئًا يشرح الرفض.
  const [error, setError] = useState<string>("");
  const [slotsError, setSlotsError] = useState<string>("");
  /**
   * الحجز الناجح يحلّ محلّ النموذج بدل سطر نصّي أسفله.
   *
   * كان التأكيد فقرة خضراء تظهر في اللحظة التي **تنكمش فيها الشاشة**: تفريغ
   * الاختيار يُخفي سطر المدى والملخّص، وإعادة تحميل الشبكة تطوي عشرات الخانات
   * إلى سطر «جاري جلب الأوقات…» — فتقفز الصفحة مئات البكسلات تحت عين من يبحث
   * عن تأكيده. اللوح الكامل يشغل مكان النموذج فلا يتحرك شيء، ولا يُفوَّت.
   */
  const [justBooked, setJustBooked] = useState<AppointmentRow | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const salon = salons.find((item) => item.id === salonId) ?? null;

  const loadSlots = useCallback(async () => {
    if (!salonId) return;
    setLoadingSlots(true);
    setSlotsError("");
    try {
      const query = new URLSearchParams({ salonId });
      // الشبكة تُحسب بمدة الخدمات المختارة: خانةٌ حُسبت بنصف ساعة تعرض وقتًا
      // يُرفض عند الضغط لأن الحجز الفعلي يمتد ساعة ونصفًا.
      for (const serviceId of serviceIds) query.append("serviceId", serviceId);
      const response = await fetch(`/api/public/portal/${token}/slots?${query.toString()}`);
      const data = (await response.json().catch(() => ({}))) as {
        days?: BookingDay[];
        leadMinutes?: number;
        durationMinutes?: number;
        window?: BookingWindow;
        estimatedTotal?: number;
        message?: string;
      };
      if (!response.ok) {
        setDays([]);
        setSlotsError(data.message ?? "تعذر جلب الأوقات المتاحة");
        return;
      }
      const nextDays = data.days ?? [];
      setDays(nextDays);
      setLeadMinutes(data.leadMinutes ?? 120);
      setDurationMinutes(data.durationMinutes ?? 0);
      setBookingWindow(data.window ?? null);
      setEstimatedTotal(data.estimatedTotal ?? 0);
      // نثبّت أول يوم فيه فترة فعلية — القفز ليوم فارغ يبدو كعطل.
      const firstOpen = nextDays.find(
        (day) => !day.closed && day.slots.some((slot) => slot.status === "AVAILABLE"),
      );
      setActiveDate(firstOpen?.date ?? nextDays[0]?.date ?? "");
    } catch {
      setDays([]);
      setSlotsError("تعذر الاتصال. تحقق من اتصالك وحاول مجددًا.");
    } finally {
      setLoadingSlots(false);
    }
  }, [salonId, token, serviceIds]);

  useEffect(() => {
    setSelected("");
    void loadSlots();
  }, [loadSlots]);

  // تبديل الفرع يُبطل اختيار حلاق أو خدمة من فرع آخر — كلاهما يُرفض عند الحفظ.
  useEffect(() => {
    const nextSalon = salons.find((item) => item.id === salonId);
    setBarberId(nextSalon?.barbers.length === 1 ? nextSalon.barbers[0].id : "");
    setServiceIds([]);
  }, [salonId, salons]);

  useEffect(() => {
    setSelected("");
  }, [barberId]);

  async function submitBooking() {
    if (!selected || !salonId || !barberId) return;
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/public/portal/${token}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salonId, barberId, startAt: selected, serviceIds }),
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
      setJustBooked(data.appointment);
      setSelected("");
      setServiceIds([]);
    } catch {
      setError("تعذر الاتصال. تحقق من اتصالك وحاول مجددًا.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelAppointment(id: string) {
    const appointment = appointments.find((item) => item.id === id);
    if (!appointment || !(await confirm({
      title: "إلغاء الموعد؟",
      description: `سيُلغى موعد ${formatAppointment(appointment.startAt)} مع ${appointment.barberName ?? "الحلاق المحدد"}.`,
      confirmLabel: "نعم، إلغاء الموعد",
      tone: "danger",
    }))) return;

    setError("");
    // إلغاء موعد آخر لا يمحو تأكيد حجزٍ نجح للتوّ.
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
      if (justBooked?.id === id) setJustBooked(null);
      void loadSlots();
    } catch {
      setError("تعذر الاتصال. تحقق من اتصالك وحاول مجددًا.");
    }
  }

  const upcoming = appointments.filter(
    (item) => item.status === "BOOKED" || item.status === "ARRIVED",
  );
  const arriveEarly = arriveEarlyMinutes > 0;
  const activeDay = days.find((day) => day.date === activeDate) ?? null;
  const activeBarber = salon?.barbers.find((barber) => barber.id === barberId) ?? null;
  const windowNotice = buildWindowNotice(bookingWindow, durationMinutes, salon?.slotMinutes ?? 0);
  // الحدّ يُقرأ من الفرع المختار — كل فرع قد يضبطه على قيمة مختلفة.
  const maxActive = salon?.maxActivePerCustomer ?? salons[0]?.maxActivePerCustomer ?? 0;
  const atActiveLimit = maxActive > 0 && upcoming.length >= maxActive;

  const visibleSlots = activeDay && barberId
    ? activeDay.slots
        .map((slot) => ({
          ...slot,
          barberStatus: slot.barbers.find((barber) => barber.barberId === barberId)?.status ?? "OFF_DUTY",
        }))
        .filter((slot) => slot.barberStatus !== "OFF_DUTY")
    : [];

  // ترقيم الخطوات محسوب لا مكتوب: الفرع والحلاق قسمان مشروطان، وترقيمٌ ثابت
  // كان سيعطي «٣ الحلاق» لفرعٍ بلا قائمة حلاقين فيقفز العميل من ٢ إلى ٤.
  let stepCount = 0;
  const branchStep = salons.length > 1 ? ++stepCount : 0;
  const serviceStep = salon && salon.services.length > 0 ? ++stepCount : 0;
  const dayStep = ++stepCount;
  const barberStep = salon && salon.barbers.length > 0 ? ++stepCount : 0;
  const timeStep = ++stepCount;

  return (
    <div id="appointments" className="min-w-0 space-y-4">
      {confirmDialog}
      <section className={`rounded-2xl px-5 py-5 ${
        upcoming.length > 0
          ? "border border-salon-forest/25 bg-salon-forest/[0.07]"
          : "barber-card"
      }`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="lux-section-title">حجوزاتك القادمة</h2>
          <span className="rounded-full bg-salon-mist px-2.5 py-1 text-xs font-black tabular-nums text-salon-charcoal">
            {upcoming.length}
          </span>
        </div>
        {upcoming.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {upcoming.map((appointment) => (
              <li key={appointment.id} className="rounded-2xl bg-white px-4 py-3">
                <p className="text-sm font-black">{formatAppointment(appointment.startAt)}</p>
                <p className="mt-1 text-xs font-semibold text-salon-charcoal">
                  {appointment.salonName}
                  {appointment.barberName ? ` · ${appointment.barberName}` : ""}
                  {` · ${formatDurationLabel(appointment.durationMinutes)}`}
                  {` · ${appointment.statusLabel}`}
                </p>
                {appointment.services.length > 0 ? (
                  <p className="mt-1 text-xs font-bold text-salon-forest">
                    {appointment.services.map((service) => service.serviceName).join(" + ")}
                  </p>
                ) : null}
                {/* الإرشاد على البطاقة نفسها: من يفتح مواعيده قبل خروجه بحاجة إليه
                    هنا لا في شاشة تأكيد رآها قبل أسبوع. */}
                {appointment.canCancel && arriveEarly ? (
                  <p className="mt-2 rounded-xl bg-salon-mist px-3 py-2 text-[11px] font-bold text-salon-ink">
                    احضر قبل موعدك بـ{arriveEarlyMinutes} دقائق —{" "}
                    <span className="text-salon-forest" dir="ltr">
                      {arriveByLabel(appointment.startAt, arriveEarlyMinutes)?.clock}
                    </span>
                  </p>
                ) : null}
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
        ) : (
          <p className="mt-3 text-sm font-semibold text-salon-charcoal">لا توجد حجوزات قادمة.</p>
        )}
      </section>

      {bookingPolicy.blocked ? (
        <section className="overflow-hidden rounded-2xl border border-red-200 bg-red-50 shadow-[var(--shadow-sm)]" role="alert">
          <div className="border-b border-red-200/70 bg-red-100/60 px-5 py-3">
            <p className="text-xs font-bold text-red-700">الحجز الإلكتروني معلّق</p>
          </div>
          <div className="px-5 py-5">
            <h2 className="text-lg font-bold text-red-950">تم تسجيل عدم حضور لموعدين</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-red-900/75">
              حفاظًا على أوقات الحلاقين، لا يمكن إنشاء حجز جديد حاليًا. تواصل مع الصالون لمراجعة الحالات وإعادة تفعيل الحجز.
            </p>
          </div>
        </section>
      ) : bookingPolicy.noShowCount > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4" role="status">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-900 text-sm font-bold text-white" aria-hidden="true">!</span>
            <div>
              <h2 className="text-sm font-bold text-amber-950">تنبيه مهم قبل الحجز</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-amber-900/80">
                لديك حالة عدم حضور واحدة. عدم الحضور للموعد القادم دون إلغائه سيؤدي إلى تعليق الحجز الإلكتروني.
              </p>
            </div>
          </div>
        </section>
      ) : null}
      {/* لا تُعرض سياسة الحضور لمن لا مخالفة عليه: تحذير استباقي قبل أن يُخطئ
          أحد. صاحب المخالفة يراها أعلاه، والباقي يجدها في إيصال حجزه. */}

      {/* الحدّ يُعرض **قبل** الاختيار لا بعد الضغط: العميل كان يختار خدماته
          ويومه وحلاقه ثم يُرفض، والرسالة تُمسح قبل أن تُقرأ. */}
      {atActiveLimit && !bookingPolicy.blocked && salons.length > 0 && !justBooked ? (
        <section
          className="overflow-hidden rounded-2xl border border-salon-gold/40 bg-salon-gold/[0.09]"
          role="status"
        >
          <div className="border-b border-salon-gold/30 px-5 py-3">
            <p className="text-xs font-bold text-salon-ink">وصلت إلى حدّ المواعيد القائمة</p>
          </div>
          <div className="px-5 py-4">
            <h2 className="lux-section-title">لديك {appointmentsCount(upcoming.length)} الآن</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-salon-charcoal">
              الحدّ الأقصى {appointmentsCount(maxActive)} في وقت واحد. ألغِ موعدًا من قائمة «حجوزاتك
              القادمة» أعلاه لتحجز غيره، أو انتظر حتى ينتهي أقرب موعد.
            </p>
            <p className="mt-3 rounded-xl bg-white/70 px-3 py-2.5 text-xs font-bold text-salon-charcoal/75">
              الحدّ يحمي أوقات الحلاقين من مقاعد محجوزة لا تُستخدم.
            </p>
          </div>
        </section>
      ) : null}

      {salons.length === 0 && !bookingPolicy.blocked ? (
        <section className="barber-card px-5 py-5">
          <h2 className="lux-section-title">احجز موعدك</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-salon-charcoal">
            الحجز الإلكتروني غير متاح حاليًا. تواصل مع الصالون مباشرة لحجز موعدك، أو احجز عند زيارتك القادمة.
          </p>
        </section>
      ) : salons.length === 0 || bookingPolicy.blocked || atActiveLimit ? null : justBooked ? (
        <BookingConfirmation
          appointment={justBooked}
          arriveEarlyMinutes={arriveEarlyMinutes}
          onBookAnother={() => {
            setJustBooked(null);
            void loadSlots();
          }}
        />
      ) : (
        <section className="barber-card px-5 py-5">
          <h2 className="lux-section-title">احجز موعدك</h2>

          {salons.length > 1 ? (
            <div className="mt-4">
              <Step number={branchStep} title="الفرع" />
              <select
                aria-label="الفرع"
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
            </div>
          ) : null}

          {/* الخدمات قبل الوقت: الشبكة بلا معنى قبل معرفة كم تستغرق الزيارة. */}
          {salon && salon.services.length > 0 ? (
            <div className="mt-5">
              <Step number={serviceStep} title="الخدمات المطلوبة" hint="اختياري" />
              <div className="grid gap-2 sm:grid-cols-2">
                {salon.services.map((service) => {
                  const active = serviceIds.includes(service.id);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setServiceIds((current) =>
                          current.includes(service.id)
                            ? current.filter((id) => id !== service.id)
                            : [...current, service.id],
                        )
                      }
                      className={`flex min-h-12 items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-right transition ${
                        active
                          ? "border-salon-forest bg-salon-forest text-white shadow-sm"
                          : "border-salon-line bg-white text-salon-ink hover:border-salon-forest/40"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{service.name}</span>
                        <span className={`block text-[0.65rem] font-semibold ${active ? "text-white/75" : "text-salon-charcoal/60"}`}>
                          {formatDurationLabel(service.durationMinutes)}
                        </span>
                      </span>
                      <span className={`shrink-0 text-xs font-black tabular-nums ${active ? "text-white" : "text-salon-forest"}`}>
                        {service.price} ر.س
                      </span>
                    </button>
                  );
                })}
              </div>
              {serviceIds.length > 0 ? (
                <p className="mt-2 rounded-xl bg-salon-mist px-3 py-2 text-[0.7rem] font-bold text-salon-charcoal">
                  المدة المحجوزة {formatDurationLabel(durationMinutes)} · التقدير {estimatedTotal} ر.س
                  <span className="mt-0.5 block font-semibold text-salon-charcoal/65">
                    المبلغ النهائي يُحدَّد في الصالون.
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-[0.7rem] font-semibold text-salon-charcoal/60">
                  بلا اختيار تُحجز {formatDurationLabel(salon.slotMinutes)} فقط — حدّد خدماتك ليُحجز وقتك كاملًا.
                </p>
              )}
            </div>
          ) : null}

          {/* المهلة تُقرأ من إعداد الفرع لا تُكتب. كان العنوان «الحجز يبدأ بعد
              ساعتين من الآن» نصًّا ثابتًا بينما الشارة والسطر تحته يحسبان
              `leadMinutes`، فيقرأ عميلُ فرعٍ مهلته نصف ساعة «ساعتين» ثم يجد
              أوقاتًا متاحة أقرب — تناقض على سطرين متلاصقين. */}
          {leadMinutes > 0 ? (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-salon-gold/30 bg-salon-gold/10 px-4 py-3">
              <span
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-salon-ink text-[0.6rem] font-bold text-white"
                aria-hidden="true"
              >
                مهلة
              </span>
              <div>
                <p className="text-sm font-bold text-salon-ink">
                  أقرب موعد بعد {formatLeadDuration(leadMinutes)} من الآن
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-salon-charcoal/70">
                  نعرض تلقائيًا أول وقت يسمح به النظام؛ ما قبله يظهر بعلامة «قبل المهلة».
                </p>
              </div>
            </div>
          ) : null}

          <div className="mt-5">
            <Step number={dayStep} title="اليوم" />
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
              <Step number={barberStep} title="اختر الحلاق" hint="التوافر لليوم المختار" />
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
            <Step
              number={timeStep}
              title="الوقت"
              hint={activeBarber ? `جدول ${activeBarber.name}` : undefined}
            />
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

            {slotsError ? (
              <p
                role="alert"
                className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700"
              >
                {slotsError}
              </p>
            ) : null}

            {/* الشبكة تتقلّص كلما طالت الخدمات، والاختفاء بلا سبب يُقرأ كعطل:
                خدمة واحدة تمتدّ إلى 10:30 م وثلاث تتوقف عند 9:30 م. */}
            {windowNotice ? (
              <p className="mt-2 rounded-xl border border-salon-line bg-salon-pearl px-3 py-2.5 text-[0.7rem] font-semibold leading-5 text-salon-charcoal/75">
                {windowNotice}
              </p>
            ) : null}
          </div>

          {/* المدى لا الخانة: من يرى «5:30» وحدها يظن أنه ينصرف في السادسة. */}
          {selected && durationMinutes > 0 ? (
            <p className="mt-4 rounded-2xl border border-salon-forest/25 bg-salon-forest/[0.07] px-4 py-3 text-sm font-bold text-salon-forest">
              <span dir="ltr">{formatAppointmentSpan(selected, durationMinutes)}</span>
              {` · ${formatDurationLabel(durationMinutes)}`}
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              aria-live="assertive"
              className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
            >
              {error}
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
