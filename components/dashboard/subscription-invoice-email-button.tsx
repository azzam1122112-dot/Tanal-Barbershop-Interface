"use client";

import { useState } from "react";

export function SubscriptionInvoiceEmailButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function send() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/dashboard/subscription/invoices/${invoiceId}/email`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setMessage(data.message ?? (response.ok ? "تم إرسال الفاتورة" : "تعذر إرسال الفاتورة"));
    } catch {
      setMessage("تعذر الاتصال بخدمة البريد");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-left">
      <button type="button" disabled={loading} onClick={() => void send()} className="dashboard-button-soft px-4 py-2 text-sm">
        {loading ? "جاري الإرسال..." : "إرسال إلى البريد"}
      </button>
      {message ? <p className="mt-2 max-w-52 text-xs font-semibold text-salon-charcoal">{message}</p> : null}
    </div>
  );
}
