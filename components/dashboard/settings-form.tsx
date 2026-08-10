"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

type Settings = {
  salonName: string;
  currency: string;
  pointsPerCurrencyUnit: number;
  whatsappEnabled: boolean;
  legalName: string | null;
  defaultCommissionRate: number;
  bookingEnabled: boolean;
  bookingOpenMinute: number;
  bookingCloseMinute: number;
  bookingSlotMinutes: number;
  bookingClosedWeekdays: number[];
  bookingLeadMinutes: number;
  bookingHorizonDays: number;
  bookingMaxActivePerCustomer: number;
};

const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** دقائق من منتصف الليل → `HH:MM` لحقل الوقت، والعكس. */
function minutesToTimeValue(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function timeValueToMinutes(value: FormDataEntryValue | null, fallback: number) {
  if (typeof value !== "string") return fallback;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function SettingsForm({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(false);
  const [bookingEnabled, setBookingEnabled] = useState(initialSettings.bookingEnabled);
  const [closedWeekdays, setClosedWeekdays] = useState<number[]>(initialSettings.bookingClosedWeekdays);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/dashboard/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        salonName: form.get("salonName"),
        currency: form.get("currency"),
        pointsPerCurrencyUnit: form.get("pointsPerCurrencyUnit"),
        whatsappEnabled: form.get("whatsappEnabled") === "on",
        defaultCommissionRate: form.get("defaultCommissionRate"),
        legalName: form.get("legalName"),
        bookingEnabled,
        ...(bookingEnabled
          ? {
              bookingOpenMinute: timeValueToMinutes(form.get("bookingOpenTime"), settings.bookingOpenMinute),
              bookingCloseMinute: timeValueToMinutes(form.get("bookingCloseTime"), settings.bookingCloseMinute),
              bookingSlotMinutes: form.get("bookingSlotMinutes"),
              bookingClosedWeekdays: closedWeekdays,
              bookingLeadMinutes: form.get("bookingLeadMinutes"),
              bookingHorizonDays: form.get("bookingHorizonDays"),
              bookingMaxActivePerCustomer: form.get("bookingMaxActivePerCustomer"),
            }
          : {}),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { settings?: Settings; message?: string };
    if (response.ok && data.settings) {
      setSettings(data.settings);
      setBookingEnabled(data.settings.bookingEnabled);
      setClosedWeekdays(data.settings.bookingClosedWeekdays);
      setToast({ message: "تم تحديث الإعدادات", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث الإعدادات", tone: "error" });
    }
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="mt-6 max-w-2xl space-y-6">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      <section className="dashboard-panel p-5">
        <h2 className="text-lg font-bold tracking-tight">إعدادات الفرع</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold text-salon-charcoal">
            اسم الصالون
            <input name="salonName" defaultValue={settings.salonName} className="dashboard-field mt-2 h-12" />
          </label>
          <label className="text-sm font-bold text-salon-charcoal">
            الاسم الظاهر للعملاء
            <input name="legalName" defaultValue={settings.legalName ?? settings.salonName} className="dashboard-field mt-2 h-12" />
          </label>
          <label className="text-sm font-bold text-salon-charcoal">
            العملة
            <input name="currency" defaultValue={settings.currency} className="dashboard-field mt-2 h-12" />
          </label>
          <label className="text-sm font-bold text-salon-charcoal">
            كل ريال = كم نقطة
            <input lang="en"
              name="pointsPerCurrencyUnit"
              defaultValue={settings.pointsPerCurrencyUnit}
              type="number"
              step="0.01"
              min="0.01"
              className="dashboard-field mt-2 h-12"
            />
          </label>
          <label className="text-sm font-bold text-salon-charcoal">
            نسبة عمولة افتراضية %
            <input lang="en"
              name="defaultCommissionRate"
              defaultValue={settings.defaultCommissionRate}
              type="number"
              step="0.5"
              min="0"
              max="100"
              className="dashboard-field mt-2 h-12"
            />
            <span className="mt-1.5 block text-xs font-medium text-salon-charcoal/70">
              تُستخدم لمن لم تُحدَّد له نسبة خاصة. صفر = بلا عمولة.
            </span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-salon-line bg-white px-3 py-3 text-sm font-bold text-salon-charcoal">
            <input name="whatsappEnabled" type="checkbox" defaultChecked={settings.whatsappEnabled} />
            تفعيل واتساب في النظام
          </label>
        </div>
      </section>

      <section className="dashboard-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight">الحجز الذاتي للعملاء</h2>
            <p className="dashboard-muted mt-1.5 max-w-md text-sm leading-6">
              يتيح للعميل حجز موعد من صفحته الخاصة. المواعيد تظهر في شاشة المواعيد كبقية الحجوزات. تعطيله يبقي الحجز
              للموظفين فقط.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={bookingEnabled}
            onClick={() => setBookingEnabled((current) => !current)}
            className={`relative h-8 w-16 shrink-0 rounded-full border transition-colors ${
              bookingEnabled ? "border-salon-forest bg-salon-forest" : "border-salon-line bg-salon-mist"
            }`}
          >
            <span className="sr-only">{bookingEnabled ? "تعطيل الحجز الذاتي" : "تفعيل الحجز الذاتي"}</span>
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-[right] ${
                bookingEnabled ? "right-9" : "right-1"
              }`}
            />
          </button>
        </div>

        {bookingEnabled ? (
          <div className="mt-5 grid gap-4 border-t border-salon-line pt-5 md:grid-cols-2">
            <label className="text-sm font-bold text-salon-charcoal">
              بداية استقبال الحجز
              <input
                name="bookingOpenTime"
                type="time"
                dir="ltr"
                lang="en"
                defaultValue={minutesToTimeValue(settings.bookingOpenMinute)}
                className="dashboard-field mt-2 h-12"
              />
            </label>
            <label className="text-sm font-bold text-salon-charcoal">
              نهاية استقبال الحجز
              <input
                name="bookingCloseTime"
                type="time"
                dir="ltr"
                lang="en"
                defaultValue={minutesToTimeValue(settings.bookingCloseMinute)}
                className="dashboard-field mt-2 h-12"
              />
            </label>
            <label className="text-sm font-bold text-salon-charcoal">
              مدة الفترة (دقيقة)
              <input
                lang="en"
                name="bookingSlotMinutes"
                type="number"
                min="5"
                max="240"
                step="5"
                defaultValue={settings.bookingSlotMinutes}
                className="dashboard-field mt-2 h-12"
              />
              <span className="mt-1.5 block text-xs font-medium text-salon-charcoal/70">
                هي أيضًا مدة الموعد المحجوز.
              </span>
            </label>
            <label className="text-sm font-bold text-salon-charcoal">
              أقل مهلة قبل الموعد (دقيقة)
              <input
                lang="en"
                name="bookingLeadMinutes"
                type="number"
                min="120"
                max="10080"
                step="15"
                defaultValue={settings.bookingLeadMinutes}
                className="dashboard-field mt-2 h-12"
              />
              <span className="mt-1.5 block text-xs font-medium text-salon-charcoal/70">
                الحد الأدنى ساعتان، حتى ينهي الحلاق عميله الحالي ويستعد للموعد التالي.
              </span>
            </label>
            <label className="text-sm font-bold text-salon-charcoal">
              مدى الحجز المستقبلي (يوم)
              <input
                lang="en"
                name="bookingHorizonDays"
                type="number"
                min="1"
                max="90"
                defaultValue={settings.bookingHorizonDays}
                className="dashboard-field mt-2 h-12"
              />
            </label>
            <label className="text-sm font-bold text-salon-charcoal">
              أقصى مواعيد قائمة للعميل
              <input
                lang="en"
                name="bookingMaxActivePerCustomer"
                type="number"
                min="1"
                max="20"
                defaultValue={settings.bookingMaxActivePerCustomer}
                className="dashboard-field mt-2 h-12"
              />
              <span className="mt-1.5 block text-xs font-medium text-salon-charcoal/70">
                يمنع حجز مقاعد لا يحضرها.
              </span>
            </label>

            <fieldset className="text-sm font-bold text-salon-charcoal md:col-span-2">
              <legend className="mb-2">أيام الإغلاق الأسبوعية</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((label, index) => {
                  const closed = closedWeekdays.includes(index);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={closed}
                      aria-label={`${label}: ${closed ? "مغلق" : "مفتوح"}`}
                      onClick={() =>
                        setClosedWeekdays((current) =>
                          current.includes(index)
                            ? current.filter((day) => day !== index)
                            : [...current, index],
                        )
                      }
                      className={`min-w-24 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                        closed
                          ? "border-salon-ruby bg-salon-ruby text-white"
                          : "border-salon-line bg-white text-salon-charcoal hover:bg-salon-pearl"
                      }`}
                    >
                      <span className="block">{label}</span>
                      <span className="mt-1 block text-[10px] opacity-80">{closed ? "مغلق" : "مفتوح"}</span>
                    </button>
                  );
                })}
              </div>
              <span className="mt-2 block text-xs font-medium text-salon-charcoal/70">
                الأيام المحدَّدة تظهر للعميل بحالة «مغلق» ولا يمكن اختيارها.
              </span>
            </fieldset>
          </div>
        ) : null}
      </section>

      <button disabled={loading} className="dashboard-button h-12 px-6">
        {loading ? "جاري الحفظ..." : "حفظ الإعدادات"}
      </button>
    </form>
  );
}
