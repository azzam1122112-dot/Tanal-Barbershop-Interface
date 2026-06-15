"use client";

import { FormEvent, useState } from "react";

export function ManagerRewardButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitReward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/dashboard/customers/${customerId}/manager-rewards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        discountAmount: form.get("discountAmount"),
        expiresAt: form.get("expiresAt") || undefined,
        description: form.get("description") || undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string };

    if (response.ok) {
      setMessage("تم إصدار المكافأة");
      event.currentTarget.reset();
      window.setTimeout(() => {
        setOpen(false);
        window.location.reload();
      }, 700);
    } else {
      setMessage(data.message ?? "تعذر إصدار المكافأة");
    }
    setSubmitting(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="dashboard-button px-3 py-2 text-xs">
        مكافأة إدارية
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-salon-ink/35 px-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="إغلاق" className="absolute inset-0 cursor-default" onClick={() => setOpen(false)} />
          <form onSubmit={submitReward} className="relative w-full max-w-md rounded-lg border border-salon-line bg-white p-5 shadow-2xl shadow-salon-ink/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">إصدار مكافأة</h2>
                <p className="mt-1 text-sm font-semibold text-salon-charcoal">{customerName}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-salon-line px-3 py-2 text-sm font-bold">
                إغلاق
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <input name="title" defaultValue="مكافأة من الإدارة" required className="dashboard-field" />
              <input name="discountAmount" type="number" min="0.01" step="0.01" required placeholder="قيمة الخصم بالريال" className="dashboard-field" />
              <input name="expiresAt" type="datetime-local" className="dashboard-field" />
              <textarea name="description" rows={3} placeholder="سبب المكافأة أو ملاحظة للحلاق" className="dashboard-field" />
            </div>
            {message ? <p className="mt-3 rounded-lg border border-salon-line bg-salon-mist px-3 py-2 text-sm font-bold">{message}</p> : null}
            <button disabled={submitting} className="dashboard-button-gold mt-4 w-full">
              {submitting ? "جاري الإصدار..." : "إصدار المكافأة"}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
