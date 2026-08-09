"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import { Icon } from "@/components/icons";

type SafetyMode = "STRICT" | "BALANCED" | "CUSTOM";

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

const MODE_LABELS: Record<SafetyMode, { title: string; description: string }> = {
  STRICT: { title: "صارم", description: "7 أيام بين العروض وحدود محافظة" },
  BALANCED: { title: "متوازن", description: "3 أيام بين العروض لنشاط متوسط" },
  CUSTOM: { title: "مخصص", description: "تحكم كامل في جميع الحدود" },
};

export function WhatsAppSafetyCenter({ initialOverview }: { initialOverview: WhatsAppSafetyOverview }) {
  const [overview, setOverview] = useState(initialOverview);
  const [settings, setSettings] = useState(initialOverview.settings);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    const response = await fetch("/api/dashboard/whatsapp/safety", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = (await response.json().catch(() => ({}))) as { settings?: typeof settings; message?: string };
    if (!response.ok || !data.settings) {
      setToast({ message: data.message ?? "تعذر حفظ سياسة الحماية", tone: "error" });
      setLoading(false);
      return;
    }
    const refreshed = await fetch("/api/dashboard/whatsapp/safety");
    const next = (await refreshed.json().catch(() => null)) as WhatsAppSafetyOverview | null;
    if (refreshed.ok && next) {
      setOverview(next);
      setSettings(next.settings);
    } else {
      setSettings(data.settings);
    }
    setToast({ message: "تم تفعيل سياسة الحماية الجديدة", tone: "success" });
    setLoading(false);
  }

  function chooseMode(mode: SafetyMode) {
    const preset = mode === "STRICT"
      ? { marketingCooldownHours: 168, maxMarketingPerCustomer30Days: 4, maxMessagesPerCustomer24Hours: 2, dailyOrganizationDraftLimit: 100 }
      : mode === "BALANCED"
        ? { marketingCooldownHours: 72, maxMarketingPerCustomer30Days: 8, maxMessagesPerCustomer24Hours: 3, dailyOrganizationDraftLimit: 200 }
        : {};
    setSettings((current) => ({ ...current, mode, ...preset }));
  }

  const scoreTone = overview.metrics.riskLevel === "LOW" ? "#a78bfa" : overview.metrics.riskLevel === "MEDIUM" ? "#f59e0b" : "#ef4444";

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-violet-300/20 bg-[#0c0913] text-white shadow-[0_28px_70px_-35px_rgba(76,29,149,.8)]">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="relative overflow-hidden border-b border-white/10 p-6 sm:p-8">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="relative grid items-center gap-7 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500/15 text-violet-200"><Icon name="staff" className="h-6 w-6" /></span>
              <div><p className="text-xs font-bold tracking-[.16em] text-violet-300">XMANSX SHIELD</p><h2 className="mt-1 text-2xl font-bold">مركز حماية رقم واتساب</h2></div>
              <span className={`mr-auto rounded-full px-3 py-1 text-[11px] font-bold ${settings.marketingPaused ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>{settings.marketingPaused ? "التسويق متوقف" : "الحماية فعّالة"}</span>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">طبقة داخلية تمنع الرسائل غير المصرح بها، وتفرض فترات تهدئة وحدود تواصل قبل فتح واتساب.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {overview.recommendations.map((item) => <span key={item} className="rounded-xl border border-white/10 bg-white/[.045] px-3 py-2 text-xs text-slate-300">{item}</span>)}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="grid h-28 w-28 place-items-center rounded-full p-2" style={{ background: `conic-gradient(${scoreTone} ${overview.metrics.protectionScore}%, rgba(255,255,255,.08) 0)` }}>
              <div className="grid h-full w-full place-items-center rounded-full bg-[#0c0913] text-center"><div><p className="text-3xl font-black">{overview.metrics.protectionScore}</p><p className="text-[10px] text-slate-400">درجة الحماية</p></div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["موافقات الخدمة", overview.metrics.transactionalConsents, `${overview.metrics.totalCustomers} عميل`],
          ["موافقات التسويق", overview.metrics.marketingConsents, `${overview.metrics.optedOut} إيقاف كامل`],
          ["آخر 24 ساعة", overview.metrics.messages24Hours, `${overview.metrics.dailyUsagePercent}% من الحد`],
          ["منع وقائي", overview.metrics.blocked30Days, `${overview.metrics.coolingCustomers} داخل التهدئة`],
        ].map(([label, value, note]) => <div key={label} className="bg-[#110d19] p-5"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-white">{value}</p><p className="mt-1 text-[11px] text-violet-300">{note}</p></div>)}
      </div>

      <form onSubmit={save} className="grid gap-6 p-6 sm:p-8 xl:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="text-sm font-bold">وضع الحماية</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            {(Object.keys(MODE_LABELS) as SafetyMode[]).map((mode) => (
              <button key={mode} type="button" onClick={() => chooseMode(mode)} className={`rounded-2xl border p-4 text-right transition ${settings.mode === mode ? "border-violet-400 bg-violet-500/15" : "border-white/10 bg-white/[.035] hover:border-violet-400/40"}`}>
                <span className="font-bold">{MODE_LABELS[mode].title}</span><span className="mt-1 block text-xs text-slate-400">{MODE_LABELS[mode].description}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setSettings((current) => ({ ...current, marketingPaused: !current.marketingPaused }))} className={`mt-3 flex w-full items-center justify-between rounded-2xl border px-4 py-4 font-bold transition ${settings.marketingPaused ? "border-red-400/40 bg-red-500/10 text-red-200" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"}`}>
            <span>{settings.marketingPaused ? "استئناف الحملات التسويقية" : "إيقاف الحملات فورًا"}</span><span className={`h-3 w-3 rounded-full ${settings.marketingPaused ? "bg-red-400" : "bg-emerald-400"}`} />
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <SafetyField label="التهدئة بين العروض (ساعة)" value={settings.marketingCooldownHours} onChange={(value) => setSettings((current) => ({ ...current, mode: "CUSTOM", marketingCooldownHours: value }))} min={24} max={720} />
            <SafetyField label="عروض العميل خلال 30 يومًا" value={settings.maxMarketingPerCustomer30Days} onChange={(value) => setSettings((current) => ({ ...current, mode: "CUSTOM", maxMarketingPerCustomer30Days: value }))} min={1} max={30} />
            <SafetyField label="رسائل العميل خلال 24 ساعة" value={settings.maxMessagesPerCustomer24Hours} onChange={(value) => setSettings((current) => ({ ...current, mode: "CUSTOM", maxMessagesPerCustomer24Hours: value }))} min={1} max={10} />
            <SafetyField label="الحد اليومي للمؤسسة" value={settings.dailyOrganizationDraftLimit} onChange={(value) => setSettings((current) => ({ ...current, mode: "CUSTOM", dailyOrganizationDraftLimit: value }))} min={10} max={5000} />
          </div>
          <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-sm font-bold">
            <span>إضافة تعليمات الإيقاف تلقائيًا</span><input type="checkbox" checked={settings.appendOptOutInstructions} onChange={(event) => setSettings((current) => ({ ...current, appendOptOutInstructions: event.target.checked }))} className="h-5 w-5 accent-violet-500" />
          </label>
          <label className="mt-4 block"><span className="text-xs font-bold text-slate-300">نص الإيقاف</span><input value={settings.optOutText} onChange={(event) => setSettings((current) => ({ ...current, optOutText: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-violet-400" /></label>
          <button disabled={loading} className="mt-5 w-full rounded-xl bg-gradient-to-l from-violet-600 to-fuchsia-600 px-5 py-3.5 font-bold text-white shadow-[0_14px_30px_-14px_rgba(124,58,237,.9)] disabled:opacity-60">{loading ? "جاري التفعيل..." : "حفظ وتفعيل سياسة الحماية"}</button>
        </div>
      </form>
    </section>
  );
}

function SafetyField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number }) {
  return <label><span className="text-xs font-bold text-slate-300">{label}</span><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white outline-none focus:border-violet-400" /></label>;
}
