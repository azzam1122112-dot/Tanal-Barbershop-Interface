"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { Icon } from "@/components/icons";
import { safeFetch } from "@/lib/http/safe-fetch";

type SafetyMode = "STRICT" | "BALANCED" | "CUSTOM";
type AlertTone = "success" | "info" | "warning" | "danger";

export type WhatsAppSafetyOverview = {
  settings: {
    mode: SafetyMode;
    marketingCooldownHours: number;
    maxMarketingPerCustomer30Days: number;
    maxMessagesPerCustomer24Hours: number;
    dailyOrganizationDraftLimit: number;
    appendOptOutInstructions: boolean;
    optOutText: string;
    marketingPaused: boolean;
  };
  metrics: {
    protectionScore: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    totalCustomers: number;
    transactionalConsents: number;
    marketingConsents: number;
    optedOut: number;
    messages24Hours: number;
    marketing30Days: number;
    blocked30Days: number;
    coolingCustomers: number;
    dailyUsagePercent: number;
  };
  recommendations: string[];
};

type SafetyAlert = {
  id: string;
  tone: AlertTone;
  title: string;
  detail: string;
  href?: string;
  action?: string;
};

const MODE_LABELS: Record<SafetyMode, { title: string; description: string; badge: string }> = {
  STRICT: { title: "صارم", description: "أفضل حماية للحملات المتباعدة", badge: "موصى به" },
  BALANCED: { title: "متوازن", description: "حماية جيدة لنشاط متوسط", badge: "مرن" },
  CUSTOM: { title: "مخصص", description: "تحكم يدوي في جميع الحدود", badge: "متقدم" },
};

const ALERT_STYLES: Record<AlertTone, { card: string; icon: string; dot: string; label: string }> = {
  success: {
    card: "border-emerald-400/20 bg-emerald-400/[.07]",
    icon: "bg-emerald-400/15 text-emerald-300",
    dot: "bg-emerald-400",
    label: "مطمئن",
  },
  info: {
    card: "border-sky-400/20 bg-sky-400/[.07]",
    icon: "bg-sky-400/15 text-sky-300",
    dot: "bg-sky-400",
    label: "معلومة",
  },
  warning: {
    card: "border-amber-400/25 bg-amber-400/[.08]",
    icon: "bg-amber-400/15 text-amber-200",
    dot: "bg-amber-400",
    label: "يحتاج انتباه",
  },
  danger: {
    card: "border-rose-400/25 bg-rose-400/[.08]",
    icon: "bg-rose-400/15 text-rose-200",
    dot: "bg-rose-400",
    label: "إجراء عاجل",
  },
};

export function WhatsAppSafetyCenter({ initialOverview }: { initialOverview: WhatsAppSafetyOverview }) {
  const [overview, setOverview] = useState(initialOverview);
  const [settings, setSettings] = useState(initialOverview.settings);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(overview.settings),
    [overview.settings, settings],
  );
  const previewScore = useMemo(() => calculateProtectionScore(settings, overview.metrics), [overview.metrics, settings]);
  const alerts = useMemo(() => buildSafetyAlerts(overview), [overview]);
  const primaryAlert = alerts[0];
  const serviceConsentPercent = percentage(overview.metrics.transactionalConsents, overview.metrics.totalCustomers);
  const marketingConsentPercent = percentage(overview.metrics.marketingConsents, overview.metrics.totalCustomers);
  const scoreTone = previewScore >= 85 ? "#a78bfa" : previewScore >= 65 ? "#f59e0b" : "#fb7185";
  const scoreLabel = previewScore >= 85 ? "حماية قوية" : previewScore >= 65 ? "تحتاج تحسين" : "مخاطر مرتفعة";

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setToast(null);
    try {
      const response = await safeFetch("/api/dashboard/whatsapp/safety", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = (await response.json().catch(() => ({}))) as { settings?: typeof settings; message?: string };
      if (!response.ok || !data.settings) {
        setToast({ message: data.message ?? "تعذر حفظ سياسة الحماية", tone: "error" });
        return;
      }

      const refreshed = await safeFetch("/api/dashboard/whatsapp/safety");
      const next = (await refreshed.json().catch(() => null)) as WhatsAppSafetyOverview | null;
      if (refreshed.ok && next) {
        setOverview(next);
        setSettings(next.settings);
      } else {
        setOverview((current) => ({ ...current, settings: data.settings! }));
        setSettings(data.settings);
      }
      setToast({ message: "تم حفظ الإعدادات وتفعيل حدود الحماية فورًا", tone: "success" });
    } catch {
      setToast({ message: "تعذر الاتصال بالخادم. لم تُحفظ التغييرات.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  function chooseMode(mode: SafetyMode) {
    const preset = mode === "STRICT"
      ? { marketingCooldownHours: 168, maxMarketingPerCustomer30Days: 4, maxMessagesPerCustomer24Hours: 2, dailyOrganizationDraftLimit: 100 }
      : mode === "BALANCED"
        ? { marketingCooldownHours: 72, maxMarketingPerCustomer30Days: 8, maxMessagesPerCustomer24Hours: 3, dailyOrganizationDraftLimit: 200 }
        : {};
    setSettings((current) => ({ ...current, mode, ...preset }));
  }

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-violet-300/20 bg-[#0b0811] text-white shadow-[0_34px_90px_-42px_rgba(76,29,149,.95)]">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-600/20 blur-[90px]" />
      <div className="pointer-events-none absolute -right-32 top-80 h-80 w-80 rounded-full bg-fuchsia-600/10 blur-[100px]" />

      <div className="relative border-b border-white/10 p-5 sm:p-8">
        <div className="grid items-center gap-7 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-violet-300/15 bg-violet-500/15 text-violet-200 shadow-inner">
                <Icon name="staff" className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[11px] font-black tracking-[.2em] text-violet-300">إكس مانس إكس XMANSX SHIELD</p>
                <h2 className="mt-1 text-xl font-black sm:text-2xl">مركز حماية رقم واتساب</h2>
              </div>
              <span className={`rounded-full border px-3 py-1.5 text-[11px] font-black sm:mr-auto ${settings.marketingPaused ? "border-rose-400/25 bg-rose-500/10 text-rose-200" : "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"}`}>
                <span className={`ml-2 inline-block h-1.5 w-1.5 rounded-full ${settings.marketingPaused ? "bg-rose-400" : "animate-pulse bg-emerald-400"}`} />
                {settings.marketingPaused ? "الحملات متوقفة" : "الحماية تعمل الآن"}
              </span>
            </div>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-7 text-slate-400">
              راقب سلامة التواصل، افهم سبب كل تنبيه، واضبط الحدود الوقائية قبل تجهيز أي رسالة للعميل.
            </p>
          </div>

          <div className="flex items-center justify-between gap-5 rounded-2xl border border-white/10 bg-white/[.035] p-4 lg:min-w-[255px]">
            <div>
              <p className="text-xs font-bold text-slate-400">التقييم المباشر</p>
              <p className="mt-1 text-lg font-black">{scoreLabel}</p>
              <p className={`mt-2 text-[11px] font-bold ${isDirty ? "text-amber-300" : "text-emerald-300"}`}>
                {isDirty ? "معاينة قبل الحفظ" : "الإعدادات مفعّلة"}
              </p>
            </div>
            <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full p-[7px]" style={{ background: `conic-gradient(${scoreTone} ${previewScore}%, rgba(255,255,255,.08) 0)` }}>
              <div className="grid h-full w-full place-items-center rounded-full bg-[#0b0811] text-center">
                <div><p className="text-2xl font-black">{previewScore}</p><p className="text-[9px] text-slate-500">من 100</p></div>
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-6 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center ${ALERT_STYLES[primaryAlert.tone].card}`} role={primaryAlert.tone === "danger" ? "alert" : "status"}>
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${ALERT_STYLES[primaryAlert.tone].icon}`}>
            <Icon name="bell" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black">{primaryAlert.title}</p>
              <span className="rounded-full bg-black/20 px-2 py-1 text-[10px] font-bold text-white/70">{ALERT_STYLES[primaryAlert.tone].label}</span>
            </div>
            <p className="mt-1 text-xs font-medium leading-6 text-white/65">{primaryAlert.detail}</p>
          </div>
          {primaryAlert.href ? <Link href={primaryAlert.href} className="shrink-0 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-xs font-black transition hover:bg-white/15">{primaryAlert.action}</Link> : null}
        </div>
      </div>

      <div className="relative grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="موافقات الخدمة" value={overview.metrics.transactionalConsents} note={`${serviceConsentPercent}% من العملاء`} percent={serviceConsentPercent} tone="violet" />
        <MetricCard label="موافقات التسويق" value={overview.metrics.marketingConsents} note={`${marketingConsentPercent}% مؤهلون للعروض`} percent={marketingConsentPercent} tone="emerald" />
        <MetricCard label="استخدام اليوم" value={overview.metrics.messages24Hours} note={`${overview.metrics.dailyUsagePercent}% من الحد الوقائي`} percent={overview.metrics.dailyUsagePercent} tone={overview.metrics.dailyUsagePercent >= 80 ? "rose" : "amber"} />
        <MetricCard label="منع وقائي" value={overview.metrics.blocked30Days} note={`${overview.metrics.coolingCustomers} داخل التهدئة`} percent={Math.min(100, overview.metrics.blocked30Days * 10)} tone={overview.metrics.blocked30Days ? "rose" : "violet"} />
      </div>

      <div className="relative grid gap-6 p-5 sm:p-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <form id="whatsapp-safety-settings" onSubmit={save} className="scroll-mt-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[.025]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div><p className="font-black">إعدادات السياسة</p><p className="mt-1 text-xs text-slate-500">أي تعديل يظهر في درجة الحماية قبل اعتماده</p></div>
            {isDirty ? <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-[11px] font-black text-amber-200">تغييرات غير محفوظة</span> : <span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black text-emerald-300">محدّثة</span>}
          </div>

          <div className="grid gap-6 p-5 lg:grid-cols-[.85fr_1.15fr]">
            <div>
              <p className="text-xs font-black text-slate-300">اختر مستوى الحماية</p>
              <div className="mt-3 space-y-2">
                {(Object.keys(MODE_LABELS) as SafetyMode[]).map((mode) => (
                  <button key={mode} type="button" onClick={() => chooseMode(mode)} aria-pressed={settings.mode === mode} className={`group w-full rounded-2xl border p-4 text-right transition ${settings.mode === mode ? "border-violet-400/70 bg-violet-500/15 shadow-[0_12px_30px_-20px_rgba(139,92,246,.9)]" : "border-white/10 bg-black/10 hover:border-violet-400/35 hover:bg-white/[.04]"}`}>
                    <span className="flex items-center justify-between gap-3"><span className="font-black">{MODE_LABELS[mode].title}</span><span className={`rounded-full px-2 py-1 text-[9px] font-black ${settings.mode === mode ? "bg-violet-400/20 text-violet-200" : "bg-white/5 text-slate-500"}`}>{MODE_LABELS[mode].badge}</span></span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{MODE_LABELS[mode].description}</span>
                  </button>
                ))}
              </div>

              <button type="button" onClick={() => setSettings((current) => ({ ...current, marketingPaused: !current.marketingPaused }))} className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-right transition ${settings.marketingPaused ? "border-rose-400/35 bg-rose-500/10 text-rose-100" : "border-emerald-400/20 bg-emerald-500/[.07] text-emerald-200"}`}>
                <span><span className="block text-sm font-black">{settings.marketingPaused ? "استئناف الحملات" : "إيقاف تسويقي طارئ"}</span><span className="mt-1 block text-[10px] font-medium opacity-65">{settings.marketingPaused ? "لن تعمل حتى الحفظ" : "يمنع تجهيز رسائل العروض"}</span></span>
                <span className={`relative h-7 w-12 rounded-full transition ${settings.marketingPaused ? "bg-rose-500" : "bg-white/10"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${settings.marketingPaused ? "right-6" : "right-1"}`} /></span>
              </button>
            </div>

            <div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SafetyField label="التهدئة بين العروض" hint="المدة قبل عرض جديد" suffix="ساعة" value={settings.marketingCooldownHours} onChange={(value) => setSettings((current) => ({ ...current, mode: "CUSTOM", marketingCooldownHours: value }))} min={24} max={720} />
                <SafetyField label="عروض العميل الشهرية" hint="خلال آخر 30 يومًا" suffix="عرض" value={settings.maxMarketingPerCustomer30Days} onChange={(value) => setSettings((current) => ({ ...current, mode: "CUSTOM", maxMarketingPerCustomer30Days: value }))} min={1} max={30} />
                <SafetyField label="رسائل العميل اليومية" hint="كل أنواع الرسائل" suffix="رسالة" value={settings.maxMessagesPerCustomer24Hours} onChange={(value) => setSettings((current) => ({ ...current, mode: "CUSTOM", maxMessagesPerCustomer24Hours: value }))} min={1} max={10} />
                <SafetyField label="حد المؤسسة اليومي" hint="إجمالي الرسائل المجهزة" suffix="رسالة" value={settings.dailyOrganizationDraftLimit} onChange={(value) => setSettings((current) => ({ ...current, mode: "CUSTOM", dailyOrganizationDraftLimit: value }))} min={10} max={5000} />
              </div>

              <label className={`mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border px-4 py-3.5 transition ${settings.appendOptOutInstructions ? "border-violet-400/25 bg-violet-500/[.08]" : "border-rose-400/25 bg-rose-500/[.07]"}`}>
                <span><span className="block text-sm font-black">إضافة تعليمات الإيقاف</span><span className="mt-1 block text-[10px] font-medium text-slate-500">تُضاف تلقائيًا لكل رسالة تسويقية</span></span>
                <input type="checkbox" checked={settings.appendOptOutInstructions} onChange={(event) => setSettings((current) => ({ ...current, appendOptOutInstructions: event.target.checked }))} className="h-5 w-5 accent-violet-500" />
              </label>

              <label className="mt-4 block"><span className="text-xs font-black text-slate-300">النص الذي يراه العميل</span><input value={settings.optOutText} disabled={!settings.appendOptOutInstructions} onChange={(event) => setSettings((current) => ({ ...current, optOutText: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-600 focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-40" /></label>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
                {isDirty ? <button type="button" onClick={() => setSettings(overview.settings)} className="rounded-xl border border-white/10 px-4 py-3 text-xs font-black text-slate-300 transition hover:bg-white/5">إلغاء التغييرات</button> : null}
                <button disabled={loading || !isDirty} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-violet-600 via-purple-600 to-fuchsia-600 px-5 py-3.5 text-sm font-black text-white shadow-[0_16px_35px_-17px_rgba(124,58,237,.95)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45">
                  <Icon name={isDirty ? "check" : "staff"} className="h-4 w-4" />
                  {loading ? "جاري التفعيل..." : isDirty ? "حفظ وتفعيل الحماية" : "السياسة مفعّلة"}
                </button>
              </div>
            </div>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[.025] p-5">
            <div className="flex items-center justify-between gap-3"><div><p className="font-black">التنبيهات الذكية</p><p className="mt-1 text-xs text-slate-500">تتحدث حسب نشاط العملاء</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><Icon name="bell" className="h-5 w-5" /></span></div>
            <div className="mt-4 space-y-3">
              {alerts.slice(0, 4).map((alert) => {
                const style = ALERT_STYLES[alert.tone];
                return <div key={alert.id} className={`rounded-2xl border p-3.5 ${style.card}`}><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${style.dot}`} /><div><p className="text-xs font-black">{alert.title}</p><p className="mt-1 text-[11px] font-medium leading-5 text-white/55">{alert.detail}</p>{alert.href ? <Link href={alert.href} className="mt-2 inline-block text-[10px] font-black text-violet-300 hover:text-violet-200">{alert.action} ←</Link> : null}</div></div></div>;
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-violet-300/15 bg-gradient-to-br from-violet-500/[.10] to-transparent p-5">
            <p className="text-xs font-black tracking-wide text-violet-200">مسار الإرسال الآمن</p>
            <div className="mt-4 space-y-3">
              <SafetyStep number="01" title="سجّل الموافقة" detail="افصل موافقة الخدمة عن العروض." />
              <SafetyStep number="02" title="راجع التنبيهات" detail="عالج العملاء داخل التهدئة أو المنع." />
              <SafetyStep number="03" title="افتح واتساب" detail="بعد اجتياز الفحص الوقائي فقط." />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function MetricCard({ label, value, note, percent, tone }: { label: string; value: number; note: string; percent: number; tone: "violet" | "emerald" | "amber" | "rose" }) {
  const color = { violet: "bg-violet-400", emerald: "bg-emerald-400", amber: "bg-amber-400", rose: "bg-rose-400" }[tone];
  return <div className="bg-[#100c18] p-5"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value.toLocaleString("ar-SA")}</p></div><span className="text-[10px] font-bold text-slate-400">{note}</span></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[.07]"><div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.max(3, Math.min(100, percent))}%` }} /></div></div>;
}

function SafetyField({ label, hint, suffix, value, onChange, min, max }: { label: string; hint: string; suffix: string; value: number; onChange: (value: number) => void; min: number; max: number }) {
  return <label className="rounded-2xl border border-white/10 bg-black/15 p-3.5 transition focus-within:border-violet-400/60 focus-within:bg-violet-500/[.05]"><span className="text-xs font-black text-slate-200">{label}</span><span className="mt-1 block text-[10px] text-slate-600">{hint}</span><span className="mt-3 flex items-center gap-2"><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 flex-1 bg-transparent text-lg font-black text-white outline-none" /><span className="text-[10px] font-bold text-violet-300">{suffix}</span></span></label>;
}

function SafetyStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-violet-300/15 bg-violet-500/10 text-[10px] font-black text-violet-300">{number}</span><div><p className="text-xs font-black">{title}</p><p className="mt-1 text-[10px] leading-5 text-slate-500">{detail}</p></div></div>;
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
}

function calculateProtectionScore(settings: WhatsAppSafetyOverview["settings"], metrics: WhatsAppSafetyOverview["metrics"]) {
  let score = 100;
  if (!settings.appendOptOutInstructions) score -= 12;
  if (settings.marketingCooldownHours < 72) score -= 18;
  if (settings.maxMarketingPerCustomer30Days > 8) score -= 15;
  const draftDailyUsage = Math.round((metrics.messages24Hours / Math.max(1, settings.dailyOrganizationDraftLimit)) * 100);
  if (draftDailyUsage > 80) score -= 15;
  score -= Math.min(20, metrics.blocked30Days * 2);
  return Math.max(0, score);
}

function buildSafetyAlerts(overview: WhatsAppSafetyOverview): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  const { settings, metrics } = overview;
  if (settings.marketingPaused) alerts.push({ id: "paused", tone: "info", title: "الحملات التسويقية متوقفة", detail: "لن يتم تجهيز أي رسالة تسويقية حتى تستأنف الحملات وتحفظ الإعداد.", action: "مراجعة الإعداد", href: "#whatsapp-safety-settings" });
  if (!settings.appendOptOutInstructions) alerts.push({ id: "opt-out", tone: "danger", title: "تعليمات إيقاف العروض غير مفعّلة", detail: "فعّلها لتمنح العميل طريقة واضحة لإيقاف الرسائل التسويقية." });
  if (metrics.dailyUsagePercent >= 80) alerts.push({ id: "daily-limit", tone: "danger", title: "اقتربت من الحد اليومي", detail: `تم استهلاك ${metrics.dailyUsagePercent}% من الحد الوقائي للمؤسسة اليوم.` });
  if (metrics.blocked30Days > 0) alerts.push({ id: "blocked", tone: "warning", title: `${metrics.blocked30Days} محاولة أوقفها النظام`, detail: "راجع الموافقات وفترات التهدئة قبل بدء الحملة التالية.", action: "عرض العملاء", href: "/dashboard/customers" });
  if (metrics.totalCustomers > 0 && metrics.marketingConsents === 0) alerts.push({ id: "no-marketing", tone: "warning", title: "لا توجد موافقات تسويقية", detail: "العروض لن تُجهّز لأي عميل قبل تسجيل موافقته الصريحة.", action: "إدارة الموافقات", href: "/dashboard/customers" });
  if (metrics.coolingCustomers > 0) alerts.push({ id: "cooling", tone: "info", title: `${metrics.coolingCustomers} عميل داخل فترة التهدئة`, detail: "سيمنع النظام تكرار العرض لهؤلاء العملاء حتى انتهاء المدة." });
  if (alerts.length === 0) alerts.push({ id: "healthy", tone: "success", title: "كل مؤشرات الحماية مستقرة", detail: "الموافقات والحدود الوقائية تعمل، ولا توجد إجراءات عاجلة الآن." });
  return alerts.sort((a, b) => alertWeight(b.tone) - alertWeight(a.tone));
}

function alertWeight(tone: AlertTone) {
  return { success: 0, info: 1, warning: 2, danger: 3 }[tone];
}
