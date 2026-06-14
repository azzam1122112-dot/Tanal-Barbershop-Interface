"use client";

import { FormEvent, useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";
import type { SafeBarber } from "@/lib/auth/sanitize";

type BarberResponse = {
  barber?: SafeBarber;
  barbers?: SafeBarber[];
  message?: string;
};

export function BarberManager({ initialBarbers }: { initialBarbers: SafeBarber[] }) {
  const [barbers, setBarbers] = useState(initialBarbers);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(false);

  async function createBarber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setToast(null);
    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/dashboard/barbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        phone: form.get("phone"),
        pin: form.get("pin"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as BarberResponse;

    if (response.ok && data.barber) {
      setBarbers((current) => [data.barber!, ...current]);
      event.currentTarget.reset();
      setToast({ message: "تم إضافة الحلاق بنجاح", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر حفظ الحلاق", tone: "error" });
    }
    setLoading(false);
  }

  async function patchBarber(id: string, body: Record<string, unknown>) {
    setToast(null);
    const response = await fetch(`/api/dashboard/barbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as BarberResponse;

    if (response.ok && data.barber) {
      setBarbers((current) => current.map((barber) => (barber.id === id ? data.barber! : barber)));
      setToast({ message: "تم تحديث بيانات الحلاق", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث الحلاق", tone: "error" });
    }
  }

  async function resetPin(id: string, pin: string) {
    setToast(null);
    const response = await fetch(`/api/dashboard/barbers/${id}/reset-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = (await response.json().catch(() => ({}))) as BarberResponse;

    setToast(response.ok ? { message: "تم تعيين رمز دخول جديد", tone: "success" } : { message: data.message ?? "تعذر تعيين الرمز", tone: "error" });
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <form onSubmit={createBarber} className="dashboard-panel space-y-4 p-5">
        <h2 className="text-xl font-black">إضافة حلاق</h2>
        <input name="name" required placeholder="اسم الحلاق" className="dashboard-field" />
        <input name="phone" required placeholder="رقم الجوال" className="dashboard-field" />
        <input name="pin" required minLength={4} maxLength={6} inputMode="numeric" placeholder="رمز الدخول 4 أو 6 أرقام" className="dashboard-field" />
        <button disabled={loading} className="dashboard-button w-full">
          {loading ? "جاري الحفظ..." : "حفظ الحلاق"}
        </button>
      </form>

      <div className="dashboard-panel overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_120px] gap-3 border-b border-salon-line px-4 py-3 text-sm font-bold text-salon-charcoal">
          <span>الحلاق</span>
          <span>الحالة</span>
          <span>إجراءات</span>
        </div>
        <div className="divide-y divide-salon-line">
          {barbers.map((barber) => (
            <div key={barber.id} className="grid grid-cols-[1fr_140px_120px] gap-3 px-4 py-4 text-sm">
              <div>
                <input
                  defaultValue={barber.name}
                  onBlur={(event) => event.currentTarget.value !== barber.name && patchBarber(barber.id, { name: event.currentTarget.value })}
                  className="dashboard-field mb-2 py-2 font-bold"
                />
                <input
                  defaultValue={barber.phone}
                  onBlur={(event) => event.currentTarget.value !== barber.phone && patchBarber(barber.id, { phone: event.currentTarget.value })}
                  className="dashboard-field py-2"
                />
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => patchBarber(barber.id, { isActive: !barber.isActive })}
                  className={`rounded-lg px-3 py-2 font-bold ${barber.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                >
                  {barber.isActive ? "نشط" : "غير نشط"}
                </button>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    const pin = window.prompt("أدخل رمزًا من 4 أو 6 أرقام");
                    if (pin) void resetPin(barber.id, pin);
                  }}
                  className="dashboard-button-soft px-3 py-2"
                >
                  رمز جديد
                </button>
              </div>
            </div>
          ))}
          {barbers.length === 0 ? <p className="px-4 py-8 text-center text-salon-charcoal">لا يوجد حلاقون بعد</p> : null}
        </div>
      </div>
    </div>
  );
}
