"use client";

import { useState } from "react";

/**
 * يسلّم الحلاق رابط صفحة النقاط للعميل: نسخ، أو مشاركة عبر واتساب.
 * لا إرسال تلقائي — يفتح wa.me فقط كسياسة الواتساب في النظام.
 */
export function CustomerPortalShare({ customerId, customerName, customerPhone }: { customerId: string; customerName: string; customerPhone: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function buildLink() {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/barber/customers/${customerId}/portal-link`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { path?: string; message?: string };

    if (response.ok && data.path) {
      const url = `${window.location.origin}${data.path}`;
      setLink(url);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
      setMessage("تم نسخ الرابط");
    } else {
      setMessage(data.message ?? "تعذر إنشاء الرابط");
    }
    setLoading(false);
  }

  const waHref = link
    ? `https://wa.me/${customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
        `مرحبًا ${customerName}، تابع رصيد نقاطك ومكافآتك من هنا: ${link}`,
      )}`
    : null;

  return (
    <div className="mt-3 grid gap-2">
      <button type="button" onClick={() => void buildLink()} disabled={loading} className="barber-ghost-button h-12">
        {loading ? "..." : link ? "نسخ رابط النقاط مجددًا" : "رابط نقاط العميل"}
      </button>
      {waHref ? (
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="barber-gold-button h-12 py-3 text-center">
          إرسال الرابط عبر واتساب
        </a>
      ) : null}
      {message ? <p className="text-center text-xs font-bold text-salon-forest">{message}</p> : null}
    </div>
  );
}
