"use client";

import { useState } from "react";
import { FeedbackNote, useFeedback } from "@/components/ui/toast";
import { safeFetch } from "@/lib/http/safe-fetch";

export function SubscriptionInvoiceEmailButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);
  // كان رد الخادم يُعرض بلون واحد سواء أرسل البريد أو رفض.
  const { feedback, setFeedback, clear } = useFeedback();

  async function send() {
    setLoading(true);
    clear();
    try {
      const response = await safeFetch(`/api/dashboard/subscription/invoices/${invoiceId}/email`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setFeedback({
        message: data.message ?? (response.ok ? "تم إرسال الفاتورة إلى بريدك" : "تعذر إرسال الفاتورة"),
        tone: response.ok ? "success" : "error",
      });
    } catch {
      setFeedback({ message: "تعذر الاتصال بخدمة البريد", tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-left">
      <button type="button" disabled={loading} onClick={() => void send()} className="dashboard-button-soft px-4 py-2 text-sm">
        {loading ? "جاري الإرسال..." : "إرسال إلى البريد"}
      </button>
      <FeedbackNote feedback={feedback} className="mt-2 max-w-64 text-xs" />
    </div>
  );
}
