"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

type ManagedService = {
  id: string;
  name: string;
  defaultPrice: number;
  isActive?: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
};

type ServiceResponse = {
  service?: ManagedService;
  message?: string;
};

export function ServiceManager({ initialServices }: { initialServices: ManagedService[] }) {
  const [services, setServices] = useState(initialServices);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(false);

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/dashboard/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        defaultPrice: form.get("defaultPrice"),
        sortOrder: form.get("sortOrder"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as ServiceResponse;

    if (response.ok && data.service) {
      setServices((current) => [...current, data.service!].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "ar")));
      event.currentTarget.reset();
      setToast({ message: "تم إنشاء الخدمة بنجاح", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إنشاء الخدمة", tone: "error" });
    }
    setLoading(false);
  }

  async function updateService(id: string, body: Record<string, unknown>) {
    setToast(null);
    const response = await fetch(`/api/dashboard/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as ServiceResponse;

    if (response.ok && data.service) {
      setServices((current) => current.map((service) => (service.id === id ? data.service! : service)));
      setToast({ message: "تم تحديث الخدمة", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث الخدمة", tone: "error" });
    }
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <form onSubmit={createService} className="dashboard-panel space-y-4 p-5">
        <h2 className="text-xl font-black">إضافة خدمة</h2>
        <input name="name" required placeholder="اسم الخدمة" className="dashboard-field" />
        <input name="defaultPrice" required type="number" min={0} step="0.01" placeholder="السعر الافتراضي" className="dashboard-field" />
        <input name="sortOrder" required type="number" step={1} defaultValue={0} placeholder="ترتيب الظهور" className="dashboard-field" />
        <button disabled={loading} className="dashboard-button w-full">
          {loading ? "جاري الحفظ..." : "حفظ الخدمة"}
        </button>
      </form>

      <div className="dashboard-panel overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_100px_120px] gap-3 border-b border-salon-line px-4 py-3 text-sm font-bold text-salon-charcoal">
          <span>الخدمة</span>
          <span>السعر</span>
          <span>الترتيب</span>
          <span>الحالة</span>
        </div>
        <div className="divide-y divide-salon-line">
          {services.map((service) => (
            <div key={service.id} className="grid grid-cols-[1fr_120px_100px_120px] gap-3 px-4 py-4 text-sm">
              <input
                defaultValue={service.name}
                onBlur={(event) => event.currentTarget.value !== service.name && updateService(service.id, { name: event.currentTarget.value })}
                className="dashboard-field py-2 font-bold"
              />
              <input
                defaultValue={service.defaultPrice}
                type="number"
                min={0}
                step="0.01"
                onBlur={(event) => Number(event.currentTarget.value) !== service.defaultPrice && updateService(service.id, { defaultPrice: event.currentTarget.value })}
                className="dashboard-field py-2"
              />
              <input
                defaultValue={service.sortOrder ?? 0}
                type="number"
                step={1}
                onBlur={(event) => Number(event.currentTarget.value) !== (service.sortOrder ?? 0) && updateService(service.id, { sortOrder: event.currentTarget.value })}
                className="dashboard-field py-2"
              />
              <button
                type="button"
                onClick={() => updateService(service.id, { isActive: !service.isActive })}
                className={`rounded-lg px-3 py-2 font-bold ${service.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
              >
                {service.isActive ? "نشطة" : "معطلة"}
              </button>
            </div>
          ))}
          {services.length === 0 ? <p className="px-4 py-8 text-center text-salon-charcoal">لا توجد خدمات بعد</p> : null}
        </div>
      </div>
    </div>
  );
}
