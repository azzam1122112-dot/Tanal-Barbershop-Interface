"use client";

import { useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

export function CustomerWhatsAppToggle({ customerId, initialOptIn }: { customerId: string; initialOptIn: boolean }) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  async function toggle() {
    setLoading(true);
    const next = !optIn;
    const response = await fetch(`/api/dashboard/customers/${customerId}/whatsapp-preference`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsappOptIn: next }),
    });
    if (response.ok) {
      setOptIn(next);
      setToast({ message: next ? "تم تفعيل رسائل واتساب للعميل" : "تم إيقاف رسائل واتساب للعميل", tone: "success" });
    } else {
      setToast({ message: "تعذر تحديث تفضيل واتساب", tone: "error" });
    }
    setLoading(false);
  }

  return (
    <>
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <button
        type="button"
        disabled={loading}
        onClick={toggle}
        className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-60 ${optIn ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
      >
        {optIn ? "واتساب مسموح" : "واتساب موقوف"}
      </button>
    </>
  );
}
