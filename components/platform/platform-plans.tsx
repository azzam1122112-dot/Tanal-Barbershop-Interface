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
  maxCustomers: number | null;
  isActive: boolean;
  organizationsCount: number;
};

export function PlatformPlans({ initialPlans }: { initialPlans: PlanRow[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pending, setPending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
        maxCustomers: form.get("maxCustomers") || null,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { plan?: PlanRow; message?: string };
    if (response.ok && data.plan) {
      setPlans((current) => [...current, data.plan!]);
      formEl.reset();
      setToast({ message: "تم إنشاء الباقة", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إنشاء الباقة", tone: "error" });
    }
    setPending(false);
  }

  async function savePatch(id: string, body: Record<string, unknown>, successMessage: string) {
    const response = await fetch(`/api/platform/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    if (response.ok) {
      setToast({ message: successMessage, tone: "success" });
      return true;
    }
    setToast({ message: data.message ?? "تعذر تحديث الباقة", tone: "error" });
    return false;
  }

  async function toggleActive(plan: PlanRow) {
    if (await savePatch(plan.id, { isActive: !plan.isActive }, "تم تحديث الباقة")) {
      setPlans((current) => current.map((item) => (item.id === plan.id ? { ...item, isActive: !item.isActive } : item)));
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, plan: PlanRow) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"),
      priceMonthly: form.get("priceMonthly"),
      maxSalons: form.get("maxSalons"),
      maxBarbers: form.get("maxBarbers") || null,
      maxCustomers: form.get("maxCustomers") || null,
    };
    if (await savePatch(plan.id, body, "تم تحديث الباقة")) {
      setPlans((current) =>
        current.map((item) =>
          item.id === plan.id
            ? {
                ...item,
                name: String(body.name),
                priceMonthly: Number(body.priceMonthly),
                maxSalons: Number(body.maxSalons),
                maxBarbers: body.maxBarbers ? Number(body.maxBarbers) : null,
                maxCustomers: body.maxCustomers ? Number(body.maxCustomers) : null,
              }
            : item,
        ),
      );
      setEditingId(null);
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
        <label className="block text-sm font-semibold">حد العملاء (اختياري)<input name="maxCustomers" type="number" min={1} className="dashboard-field mt-2" placeholder="بلا حد" /></label>
        <button disabled={pending} aria-busy={pending} className="dashboard-button-gold w-full">{pending ? "جاري الإضافة..." : "إضافة الباقة"}</button>
      </form>

      <div className="dashboard-panel overflow-x-auto">
        <table className="dashboard-table min-w-[760px]">
          <thead>
            <tr>
              <th>الباقة</th>
              <th>السعر</th>
              <th>الحدود</th>
              <th>المؤسسات</th>
              <th>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) =>
              editingId === plan.id ? (
                <tr key={plan.id}>
                  <td colSpan={5} className="px-3 py-3">
                    <form onSubmit={(event) => saveEdit(event, plan)} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-6">
                      <label className="col-span-2 block text-xs font-semibold sm:col-span-1">الاسم<input name="name" defaultValue={plan.name} required className="dashboard-field mt-1 py-2 text-xs" /></label>
                      <label className="block text-xs font-semibold">السعر<input name="priceMonthly" type="number" min={0} defaultValue={plan.priceMonthly} className="dashboard-field mt-1 py-2 text-xs" /></label>
                      <label className="block text-xs font-semibold">الصالونات<input name="maxSalons" type="number" min={1} defaultValue={plan.maxSalons} required className="dashboard-field mt-1 py-2 text-xs" /></label>
                      <label className="block text-xs font-semibold">الحلاقون<input name="maxBarbers" type="number" min={1} defaultValue={plan.maxBarbers ?? ""} placeholder="∞" className="dashboard-field mt-1 py-2 text-xs" /></label>
                      <label className="block text-xs font-semibold">العملاء<input name="maxCustomers" type="number" min={1} defaultValue={plan.maxCustomers ?? ""} placeholder="∞" className="dashboard-field mt-1 py-2 text-xs" /></label>
                      <div className="col-span-2 flex gap-2 sm:col-span-1">
                        <button className="dashboard-button-gold flex-1 px-2 py-2 text-xs">حفظ</button>
                        <button type="button" onClick={() => setEditingId(null)} className="dashboard-button-soft px-2 py-2 text-xs">إلغاء</button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={plan.id}>
                  <td>
                    <p className="font-bold text-salon-ink">{plan.name}</p>
                    <p className="text-xs font-medium text-salon-charcoal/70" dir="ltr">{plan.slug}</p>
                  </td>
                  <td className="tabular-nums">{plan.priceMonthly} ريال</td>
                  <td className="tabular-nums">{plan.maxSalons} فرع · {plan.maxBarbers ?? "∞"} حلاق · {plan.maxCustomers ?? "∞"} عميل</td>
                  <td className="tabular-nums">{plan.organizationsCount}</td>
                  <td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => setEditingId(plan.id)} className="dashboard-button-soft px-2.5 py-1.5 text-xs">تعديل</button>
                      <button
                        type="button"
                        onClick={() => toggleActive(plan)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${plan.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                      >
                        {plan.isActive ? "فعّالة" : "معطّلة"}
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {plans.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-salon-charcoal">لا توجد باقات</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
