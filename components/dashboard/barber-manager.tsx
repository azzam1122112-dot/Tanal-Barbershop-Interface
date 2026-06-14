"use client";

import { FormEvent, useState } from "react";
import type { SafeBarber } from "@/lib/auth/sanitize";

type BarberResponse = {
  barber?: SafeBarber;
  barbers?: SafeBarber[];
  message?: string;
};

export function BarberManager({ initialBarbers }: { initialBarbers: SafeBarber[] }) {
  const [barbers, setBarbers] = useState(initialBarbers);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function createBarber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
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
      setMessage("تم إضافة الحلاق");
    } else {
      setMessage(data.message ?? "تعذر حفظ الحلاق");
    }
    setLoading(false);
  }

  async function patchBarber(id: string, body: Record<string, unknown>) {
    setMessage("");
    const response = await fetch(`/api/dashboard/barbers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as BarberResponse;

    if (response.ok && data.barber) {
      setBarbers((current) => current.map((barber) => (barber.id === id ? data.barber! : barber)));
      setMessage("تم تحديث بيانات الحلاق");
    } else {
      setMessage(data.message ?? "تعذر تحديث الحلاق");
    }
  }

  async function resetPin(id: string, pin: string) {
    setMessage("");
    const response = await fetch(`/api/dashboard/barbers/${id}/reset-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = (await response.json().catch(() => ({}))) as BarberResponse;

    setMessage(response.ok ? "تم تعيين رمز دخول جديد" : data.message ?? "تعذر تعيين الرمز");
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
      <form onSubmit={createBarber} className="space-y-4 rounded-lg border border-salon-line bg-white p-5">
        <h2 className="text-xl font-bold">إضافة حلاق</h2>
        <input name="name" required placeholder="اسم الحلاق" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
        <input name="phone" required placeholder="رقم الجوال" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
        <input name="pin" required minLength={4} maxLength={6} inputMode="numeric" placeholder="رمز الدخول 4 أو 6 أرقام" className="w-full rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
        <button disabled={loading} className="w-full rounded-md bg-salon-ink px-4 py-3 font-bold text-white disabled:opacity-60">
          {loading ? "جاري الحفظ..." : "حفظ الحلاق"}
        </button>
        {message ? <p className="rounded-md bg-salon-mist px-3 py-2 text-sm text-salon-charcoal">{message}</p> : null}
      </form>

      <div className="overflow-hidden rounded-lg border border-salon-line bg-white">
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
                  className="mb-2 w-full rounded-md border border-salon-line px-2 py-2 font-bold outline-none focus:border-salon-gold"
                />
                <input
                  defaultValue={barber.phone}
                  onBlur={(event) => event.currentTarget.value !== barber.phone && patchBarber(barber.id, { phone: event.currentTarget.value })}
                  className="w-full rounded-md border border-salon-line px-2 py-2 outline-none focus:border-salon-gold"
                />
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => patchBarber(barber.id, { isActive: !barber.isActive })}
                  className={`rounded-md px-3 py-2 font-bold ${barber.isActive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
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
                  className="rounded-md border border-salon-line px-3 py-2 font-bold hover:border-salon-gold"
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
