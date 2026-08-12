"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

type RequestRow = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  identityVerifiedAt?: string | null;
  executedAt?: string | null;
};

const typeLabels: Record<string, string> = {
  ACCESS: "الوصول إلى بياناتي",
  COPY: "الحصول على نسخة",
  CORRECTION: "تصحيح بياناتي",
  DELETION: "حذف بياناتي",
  WITHDRAW_CONSENT: "سحب موافقة التواصل",
};

const statusLabels: Record<string, string> = {
  OPEN: "مفتوح",
  IN_PROGRESS: "قيد المعالجة",
  COMPLETED: "مكتمل",
  REJECTED: "مرفوض مع بيان السبب",
};

export function CustomerPrivacyRequest({ token, initialRequests }: { token: string; initialRequests: RequestRow[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestType, setRequestType] = useState("ACCESS");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(`/api/public/portal/${encodeURIComponent(token)}/privacy-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: form.get("type"),
        details: form.get("details"),
        verificationPhone: form.get("verificationPhone"),
        requestedName: form.get("requestedName") || undefined,
        requestedPhone: form.get("requestedPhone") || undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { request?: RequestRow; message?: string };
    if (response.ok && data.request) {
      setRequests((current) => [data.request!, ...current]);
      setMessage("تم استلام طلبك، وستتم معالجته خلال 30 يومًا.");
      formElement.reset();
    } else {
      setMessage(data.message ?? "تعذر إرسال الطلب");
    }
    setLoading(false);
  }

  return (
    /* مطوي افتراضيًا: نموذج من أربعة حقول يفتحه العميل مرة في العمر، وبقاؤه
       مفتوحًا كان يجعل نصف الصفحة استمارة رسمية بدل بطاقة ولاء. يبقى الوصول
       إليه بنقرة واحدة، وتظهر الطلبات القائمة دائمًا خارج الطيّ. */
    <section className="barber-card overflow-hidden">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-salon-ink transition-colors hover:bg-salon-pearl">
          <span>خصوصيتك وحقوقك</span>
          <span
            aria-hidden="true"
            className="text-xs font-bold text-salon-charcoal transition-transform duration-200 group-open:rotate-180"
          >
            ▾
          </span>
        </summary>

        <div className="border-t border-salon-line/70 px-5 pb-5 pt-4">
          <p className="text-xs font-semibold leading-6 text-salon-charcoal">
            الصالون مسؤول عن بيانات زبائنه، وتساعده إكس مانس إكس XMANSX في تنفيذ طلبك. اقرأ{" "}
            <Link href="/privacy" className="font-bold text-salon-forest underline">
              سياسة الخصوصية
            </Link>
            .
          </p>

          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block text-xs font-bold">
              نوع الطلب
              <select
                name="type"
                required
                value={requestType}
                onChange={(event) => setRequestType(event.target.value)}
                className="dashboard-field mt-1.5"
              >
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-bold">
              جوال صاحب البطاقة للتحقق
              <input
                name="verificationPhone"
                required
                inputMode="numeric"
                pattern="05[0-9]{8}"
                maxLength={10}
                placeholder="05xxxxxxxx"
                dir="ltr"
                className="dashboard-field mt-1.5 text-left"
              />
            </label>

            {requestType === "CORRECTION" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold">
                  الاسم الصحيح
                  <input name="requestedName" minLength={2} maxLength={60} className="dashboard-field mt-1.5" />
                </label>
                <label className="block text-xs font-bold">
                  الجوال الصحيح
                  <input
                    name="requestedPhone"
                    inputMode="numeric"
                    pattern="05[0-9]{8}"
                    maxLength={10}
                    dir="ltr"
                    className="dashboard-field mt-1.5 text-left"
                  />
                </label>
              </div>
            ) : null}

            <label className="block text-xs font-bold">
              تفاصيل تساعد الصالون على تنفيذ الطلب
              <textarea name="details" maxLength={1000} rows={3} className="dashboard-field mt-1.5 resize-y" />
            </label>

            <button disabled={loading} className="dashboard-button w-full">
              {loading ? "جاري الإرسال..." : "إرسال طلب الخصوصية"}
            </button>
          </form>

          {message ? (
            <p className="mt-3 rounded-xl bg-salon-mist px-3 py-2 text-xs font-bold" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </details>

      {requests.length > 0 ? (
        <ul className="space-y-2 border-t border-salon-line/70 px-5 py-4">
          {requests.map((request) => (
            <li key={request.id} className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span>
                {typeLabels[request.type] ?? request.type}
                {request.identityVerifiedAt ? (
                  <small className="block font-bold text-salon-forest">تم التحقق من الهوية</small>
                ) : null}
              </span>
              <span className="shrink-0 text-left">
                <span className="rounded-full bg-salon-mist px-2.5 py-1 font-bold">
                  {statusLabels[request.status] ?? request.status}
                </span>
                {request.status === "COMPLETED" && (request.type === "ACCESS" || request.type === "COPY") ? (
                  <a
                    className="mt-2 block font-bold text-salon-forest underline"
                    href={`/api/public/portal/${encodeURIComponent(token)}/privacy-requests/${request.id}/download`}
                  >
                    تنزيل نسختي
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
