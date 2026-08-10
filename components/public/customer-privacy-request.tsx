"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type RequestRow = { id: string; type: string; status: string; createdAt: string };

const typeLabels: Record<string, string> = {
  ACCESS: "الوصول إلى بياناتي",
  COPY: "الحصول على نسخة",
  CORRECTION: "تصحيح بياناتي",
  DELETION: "حذف بياناتي",
  WITHDRAW_CONSENT: "سحب موافقة التواصل",
};

const statusLabels: Record<string, string> = { OPEN: "مفتوح", IN_PROGRESS: "قيد المعالجة", COMPLETED: "مكتمل", REJECTED: "مرفوض مع بيان السبب" };

export function CustomerPrivacyRequest({ token, initialRequests }: { token: string; initialRequests: RequestRow[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/public/portal/${encodeURIComponent(token)}/privacy-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: form.get("type"), details: form.get("details") }),
    });
    const data = (await response.json().catch(() => ({}))) as { request?: RequestRow; message?: string };
    if (response.ok && data.request) {
      setRequests((current) => [data.request!, ...current]);
      setMessage("تم استلام طلبك، وستتم معالجته خلال 30 يومًا.");
      event.currentTarget.reset();
    } else {
      setMessage(data.message ?? "تعذر إرسال الطلب");
    }
    setLoading(false);
  }

  return (
    <section className="barber-card px-5 py-5">
      <h2 className="text-base font-bold">خصوصيتك وحقوقك</h2>
      <p className="mt-2 text-xs font-semibold leading-6 text-salon-charcoal">الصالون مسؤول عن بيانات زبائنه، وتساعده XMANSX في تنفيذ طلبك. اقرأ <Link href="/privacy" className="font-bold text-violet-800 underline">سياسة الخصوصية</Link>.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block text-xs font-bold">نوع الطلب<select name="type" required className="dashboard-field mt-1.5"><option value="ACCESS">الوصول إلى بياناتي</option><option value="COPY">الحصول على نسخة</option><option value="CORRECTION">تصحيح بياناتي</option><option value="DELETION">حذف بياناتي</option><option value="WITHDRAW_CONSENT">سحب موافقة التواصل</option></select></label>
        <label className="block text-xs font-bold">تفاصيل تساعد الصالون على تنفيذ الطلب<textarea name="details" maxLength={1000} rows={3} className="dashboard-field mt-1.5 resize-y" /></label>
        <button disabled={loading} className="dashboard-button w-full">{loading ? "جاري الإرسال..." : "إرسال طلب الخصوصية"}</button>
      </form>
      {message ? <p className="mt-3 rounded-lg bg-salon-mist px-3 py-2 text-xs font-bold">{message}</p> : null}
      {requests.length > 0 ? <ul className="mt-4 space-y-2 border-t border-salon-line pt-4">{requests.map((request) => <li key={request.id} className="flex items-center justify-between gap-3 text-xs font-semibold"><span>{typeLabels[request.type] ?? request.type}</span><span className="rounded-full bg-salon-mist px-2 py-1 font-bold">{statusLabels[request.status] ?? request.status}</span></li>)}</ul> : null}
    </section>
  );
}
