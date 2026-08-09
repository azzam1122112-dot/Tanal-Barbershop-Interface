"use client";

import { useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

/**
 * زر يولّد رابط بوابة العميل ويجهّز رسالة واتساب جاهزة للإرسال يدويًا.
 * لا إرسال تلقائي — النظام يفتح wa.me فقط، كما هي سياسة الواتساب في المشروع.
 */
export function CustomerPortalLink({
  customerId,
  customerName,
  customerPhone,
}: {
  customerId: string;
  customerName: string;
  customerPhone: string;
}) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function buildLink() {
    setLoading(true);
    setToast(null);
    const response = await fetch(`/api/dashboard/customers/${customerId}/portal-link`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { path?: string; message?: string };

    if (response.ok && data.path) {
      const url = `${window.location.origin}${data.path}`;
      setLink(url);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      setToast({ message: "تم نسخ الرابط", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر إنشاء الرابط", tone: "error" });
    }
    setLoading(false);
  }

  const waHref = link
    ? `https://wa.me/${customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
        `مرحبًا ${customerName}، تابع رصيد نقاطك ومكافآتك من هنا: ${link}`,
      )}`
    : null;

  return (
    <div className="grid gap-2">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <button type="button" onClick={() => void buildLink()} disabled={loading} className="dashboard-button-soft px-3 py-2 text-xs">
        {loading ? "..." : link ? "نسخ الرابط مجددًا" : "رابط نقاط العميل"}
      </button>
      {waHref ? (
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="dashboard-button px-3 py-2 text-center text-xs">
          إرسال عبر واتساب
        </a>
      ) : null}
    </div>
  );
}
