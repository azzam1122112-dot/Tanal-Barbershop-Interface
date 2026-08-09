"use client";

import { useState } from "react";
import { DashboardToast, type ToastState } from "@/components/dashboard/toast";

type ConsentSource = "IN_PERSON" | "WEBSITE" | "WHATSAPP" | "PHONE" | "IMPORTED" | "OTHER";

export function CustomerWhatsAppToggle({
  customerId,
  initialTransactionalOptIn,
  initialMarketingOptIn,
  initialConsentSource,
}: {
  customerId: string;
  initialTransactionalOptIn: boolean;
  initialMarketingOptIn: boolean;
  initialConsentSource: ConsentSource | null;
}) {
  const [transactional, setTransactional] = useState(initialTransactionalOptIn);
  const [marketing, setMarketing] = useState(initialMarketingOptIn);
  const [source, setSource] = useState<ConsentSource>(initialConsentSource ?? "IN_PERSON");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  async function update(next: { transactionalOptIn?: boolean; marketingOptIn?: boolean; optOutReason?: string }) {
    setLoading(true);
    const response = await fetch(`/api/dashboard/customers/${customerId}/whatsapp-preference`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...next, consentSource: source }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      customer?: { whatsappTransactionalOptIn: boolean; whatsappMarketingOptIn: boolean };
      message?: string;
    };
    if (response.ok && data.customer) {
      setTransactional(data.customer.whatsappTransactionalOptIn);
      setMarketing(data.customer.whatsappMarketingOptIn);
      setToast({ message: "تم توثيق تفضيل العميل", tone: "success" });
    } else {
      setToast({ message: data.message ?? "تعذر تحديث تفضيل واتساب", tone: "error" });
    }
    setLoading(false);
  }

  return (
    <div className="min-w-[145px] space-y-2">
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <select value={source} onChange={(event) => setSource(event.target.value as ConsentSource)} disabled={loading} className="w-full rounded-lg border border-violet-100 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-600">
        <option value="IN_PERSON">موافقة حضورية</option>
        <option value="WEBSITE">عبر الموقع</option>
        <option value="WHATSAPP">داخل واتساب</option>
        <option value="PHONE">اتصال هاتفي</option>
        <option value="IMPORTED">بيانات سابقة</option>
        <option value="OTHER">مصدر آخر</option>
      </select>
      <button type="button" disabled={loading} onClick={() => void update({ transactionalOptIn: !transactional })} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[11px] font-bold transition ${transactional ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-500"}`}>
        <span>خدمة ومواعيد</span><span>{transactional ? "مسموح" : "موقوف"}</span>
      </button>
      <button type="button" disabled={loading} onClick={() => void update({ marketingOptIn: !marketing })} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[11px] font-bold transition ${marketing ? "bg-fuchsia-100 text-fuchsia-800" : "bg-slate-100 text-slate-500"}`}>
        <span>عروض تسويقية</span><span>{marketing ? "مسموح" : "موقوف"}</span>
      </button>
      {transactional || marketing ? (
        <button type="button" disabled={loading} onClick={() => void update({ transactionalOptIn: false, marketingOptIn: false, optOutReason: "طلب العميل إيقاف جميع الرسائل" })} className="w-full rounded-lg border border-red-100 px-2 py-1.5 text-[10px] font-bold text-red-600">إيقاف الكل</button>
      ) : null}
    </div>
  );
}
