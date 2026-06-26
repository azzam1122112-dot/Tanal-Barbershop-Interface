"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

type Salon = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  barbersCount?: number;
};

export function SalonsManager({ initialSalons }: { initialSalons: Salon[] }) {
  const [salons, setSalons] = useState(initialSalons);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pending, setPending] = useState(false);

  async function createSalon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setToast(null);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const response = await fetch("/api/dashboard/salons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), slug: form.get("slug") }),
    });
    const data = (await response.json().catch(() => ({}))) as { salon?: Salon; message?: string };
    if (response.ok && data.salon) {
      setSalons((current) => [...current, { ...data.salon!, barbersCount: 0 }]);
      formEl.reset();
      setToast({ message: "تم إنشاء الصالون", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إنشاء الصالون", tone: "error" });
    }
    setPending(false);
  }

  async function toggleActive(salon: Salon) {
    const response = await fetch(`/api/dashboard/salons/${salon.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !salon.isActive }),
    });
    const data = (await response.json().catch(() => ({}))) as { salon?: Salon; message?: string };
    if (response.ok && data.salon) {
      setSalons((current) => current.map((item) => (item.id === salon.id ? { ...item, isActive: data.salon!.isActive } : item)));
      setToast({ message: "تم تحديث حالة الصالون", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث الصالون", tone: "error" });
    }
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[380px_1fr]">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      <form onSubmit={createSalon} className="dashboard-panel space-y-3 p-5">
        <h2 className="text-lg font-bold tracking-tight">إضافة صالون</h2>
        <p className="dashboard-muted">أضف فرعًا جديدًا تحت مؤسستك. كل صالون له حلاقوه وصندوقه وإعداداته.</p>
        <label className="block text-sm font-semibold">
          اسم الصالون
          <input name="name" required className="dashboard-field mt-2" placeholder="مثال: فرع العليا" />
        </label>
        <label className="block text-sm font-semibold">
          معرّف الصالون
          <input name="slug" required dir="ltr" className="dashboard-field mt-2" placeholder="al-olaya" />
        </label>
        <button disabled={pending} aria-busy={pending} className="dashboard-button-gold w-full">
          {pending ? "جاري الإضافة..." : "إضافة الصالون"}
        </button>
      </form>

      <div className="dashboard-panel overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-salon-line/70 px-5 py-4">
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-salon-gold to-[#8f6c39]" aria-hidden="true" />
          <h2 className="text-lg font-bold tracking-tight">فروع المؤسسة ({salons.length})</h2>
        </div>
        <div className="divide-y divide-salon-line/70">
          {salons.map((salon) => (
            <div key={salon.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-bold text-salon-ink">{salon.name}</p>
                <p className="mt-0.5 text-xs font-medium text-salon-charcoal/70" dir="ltr">
                  {salon.slug} · {salon.barbersCount ?? 0} حلاق
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${salon.isActive ? "bg-green-50 text-green-700 ring-green-200/70" : "bg-red-50 text-red-700 ring-red-200/70"}`}>
                  {salon.isActive ? "نشط" : "معطل"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleActive(salon)}
                  className="dashboard-button-soft px-3 py-2 text-xs"
                >
                  {salon.isActive ? "تعطيل" : "تفعيل"}
                </button>
              </div>
            </div>
          ))}
          {salons.length === 0 ? <p className="px-5 py-8 text-center text-sm text-salon-charcoal">لا توجد فروع بعد.</p> : null}
        </div>
      </div>
    </div>
  );
}
