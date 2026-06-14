"use client";

import { FormEvent, useState } from "react";

type Settings = {
  salonName: string;
  currency: string;
  pointsPerCurrencyUnit: number;
  whatsappEnabled: boolean;
};

export function SettingsForm({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
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
      setMessage("تم تحديث الإعدادات");
    } else {
      setMessage(data.message ?? "تعذر تحديث الإعدادات");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="mt-6 max-w-2xl rounded-lg border border-salon-line bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-bold text-salon-charcoal">
          اسم الصالون
          <input name="salonName" defaultValue={settings.salonName} className="mt-2 h-12 w-full rounded-md border border-salon-line px-3 text-salon-ink outline-none focus:border-salon-gold" />
        </label>
        <label className="text-sm font-bold text-salon-charcoal">
          العملة
          <input name="currency" defaultValue={settings.currency} className="mt-2 h-12 w-full rounded-md border border-salon-line px-3 text-salon-ink outline-none focus:border-salon-gold" />
        </label>
        <label className="text-sm font-bold text-salon-charcoal">
          كل ريال = كم نقطة
          <input name="pointsPerCurrencyUnit" defaultValue={settings.pointsPerCurrencyUnit} type="number" step="0.01" min="0.01" className="mt-2 h-12 w-full rounded-md border border-salon-line px-3 text-salon-ink outline-none focus:border-salon-gold" />
        </label>
        <label className="flex items-center gap-3 rounded-md border border-salon-line px-3 py-3 text-sm font-bold text-salon-charcoal">
          <input name="whatsappEnabled" type="checkbox" defaultChecked={settings.whatsappEnabled} />
          تفعيل واتساب في النظام
        </label>
      </div>
      {message ? <p className="mt-4 rounded-md bg-salon-mist px-3 py-2 text-sm text-salon-charcoal">{message}</p> : null}
      <button disabled={loading} className="mt-5 h-12 rounded-md bg-salon-ink px-6 font-bold text-white disabled:opacity-60">
        {loading ? "جاري الحفظ..." : "حفظ الإعدادات"}
      </button>
    </form>
  );
}
