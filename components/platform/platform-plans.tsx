"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

type PlanRow = {
  id: string;
  name: string;
  slug: string;
  priceMonthly: number;
  maxSalons: number;
  maxBarbers: number | null;
  isActive: boolean;
  organizationsCount: number;
};

export function PlatformPlans({ initialPlans }: { initialPlans: PlanRow[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pending, setPending] = useState(false);

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const response = await fetch("/api/platform/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        slug: form.get("slug"),
        priceMonthly: form.get("priceMonthly"),
        maxSalons: form.get("maxSalons"),
        maxBarbers: form.get("maxBarbers") || null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { plan?: { id: string; name: string; slug: string }; message?: string };
    if (response.ok && data.plan) {
      setPlans((current) => [
        ...current,
        {
          id: data.plan!.id,
          name: data.plan!.name,
          slug: data.plan!.slug,
          priceMonthly: Number(form.get("priceMonthly") ?? 0),
          maxSalons: Number(form.get("maxSalons") ?? 1),
          maxBarbers: form.get("maxBarbers") ? Number(form.get("maxBarbers")) : null,
          isActive: true,
          organizationsCount: 0,
        },
      ]);
      formEl.reset();
      setToast({ message: "تم إنشاء الباقة", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إنشاء الباقة", tone: "error" });
    }
    setPending(false);
  }

  async function toggleActive(plan: PlanRow) {
    const response = await fetch(`/api/platform/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !plan.isActive }),
    });
    if (response.ok) {
      setPlans((current) => current.map((item) => (item.id === plan.id ? { ...item, isActive: !item.isActive } : item)));
      setToast({ message: "تم تحديث الباقة", tone: "success" });
    } else {
      setToast({ message: "تعذر تحديث الباقة", tone: "error" });
    }
  }

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />

      <form onSubmit={createPlan} className="dashboard-panel space-y-3 p-5">
        <h2 className="text-lg font-bold tracking-tight">إضافة باقة</h2>
        <label className="block text-sm font-semibold">الاسم<input name="name" required className="dashboard-field mt-2" placeholder="مثال: احترافية" /></label>
        <label className="block text-sm font-semibold">المعرّف<input name="slug" required dir="ltr" className="dashboard-field mt-2" placeholder="pro" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">السعر/شهر<input name="priceMonthly" type="number" min={0} defaultValue={0} className="dashboard-field mt-2" /></label>
          <label className="block text-sm font-semibold">حد الصالونات<input name="maxSalons" type="number" min={1} defaultValue={1} required className="dashboard-field mt-2" /></label>
        </div>
        <label className="block text-sm font-semibold">حد الحلاقين (اختياري)<input name="maxBarbers" type="number" min={1} className="dashboard-field mt-2" placeholder="بلا حد" /></label>
        <button disabled={pending} aria-busy={pending} className="dashboard-button-gold w-full">{pending ? "جاري الإضافة..." : "إضافة الباقة"}</button>
      </form>

      <div className="dashboard-panel overflow-x-auto">
        <table className="dashboard-table min-w-[640px]">
          <thead>
            <tr>
              <th>الباقة</th>
              <th>السعر</th>
              <th>الحدود</th>
              <th>المؤسسات</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>
                  <p className="font-bold text-salon-ink">{plan.name}</p>
                  <p className="text-xs font-medium text-salon-charcoal/70" dir="ltr">{plan.slug}</p>
                </td>
                <td className="tabular-nums">{plan.priceMonthly} ريال</td>
                <td className="tabular-nums">{plan.maxSalons} فرع · {plan.maxBarbers ?? "∞"} حلاق</td>
                <td className="tabular-nums">{plan.organizationsCount}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => toggleActive(plan)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ${plan.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                  >
                    {plan.isActive ? "فعّالة" : "معطّلة"}
                  </button>
                </td>
              </tr>
            ))}
            {plans.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-salon-charcoal">لا توجد باقات</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
