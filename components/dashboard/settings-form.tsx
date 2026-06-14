"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

type Settings = {
  salonName: string;
  currency: string;
  pointsPerCurrencyUnit: number;
  whatsappEnabled: boolean;
};

export function SettingsForm({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(false);

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
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { settings?: Settings; message?: string };
    if (response.ok && data.settings) {
      setSettings(data.settings);
      setToast({ message: "تم تحديث الإعدادات", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث الإعدادات", tone: "error" });
    }
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="dashboard-panel mt-6 max-w-2xl p-5">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-bold text-salon-charcoal">
          اسم الصالون
          <input name="salonName" defaultValue={settings.salonName} className="dashboard-field mt-2 h-12" />
        </label>
        <label className="text-sm font-bold text-salon-charcoal">
          العملة
          <input name="currency" defaultValue={settings.currency} className="dashboard-field mt-2 h-12" />
        </label>
        <label className="text-sm font-bold text-salon-charcoal">
          كل ريال = كم نقطة
          <input name="pointsPerCurrencyUnit" defaultValue={settings.pointsPerCurrencyUnit} type="number" step="0.01" min="0.01" className="dashboard-field mt-2 h-12" />
        </label>
        <label className="flex items-center gap-3 rounded-lg border border-salon-line bg-white px-3 py-3 text-sm font-bold text-salon-charcoal">
          <input name="whatsappEnabled" type="checkbox" defaultChecked={settings.whatsappEnabled} />
          تفعيل واتساب في النظام
        </label>
      </div>
      <button disabled={loading} className="dashboard-button mt-5 h-12 px-6">
        {loading ? "جاري الحفظ..." : "حفظ الإعدادات"}
      </button>
    </form>
  );
}
