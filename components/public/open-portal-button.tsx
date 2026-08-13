"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeFetch } from "@/lib/http/safe-fetch";

/**
 * الإجراء الأساسي في بطاقة المحفظة: افتح بوابة الصالون.
 *
 * المحفظة تُجيب «كم رصيدي»، والبوابة تُجيب «ماذا أفعل الآن» — الحجز والعروض
 * وقائمة الأسعار. وكانت الثانية لا تُفتح إلا برابط يسلّمه الحلاق، فمن سجّل نفسه
 * من `/join` يقف عند رقم لا يستطيع فعل شيء به.
 *
 * الطلب `POST` لأنه يُصدر رمزًا جديدًا — انظر مسار الـ API.
 */
export function OpenPortalButton({ reference }: { reference: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function open() {
    setLoading(true);
    setError("");
    try {
      const response = await safeFetch(`/api/account/loyalty/${encodeURIComponent(reference)}/portal`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { url?: string; message?: string };
      if (!response.ok || !data.url) {
        setError(data.message ?? "تعذر فتح بطاقة الصالون");
        return;
      }
      router.push(data.url);
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={open}
        disabled={loading}
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-salon-ink px-4 text-sm font-bold text-white transition hover:bg-salon-charcoal disabled:opacity-60"
      >
        {loading ? "جارٍ الفتح…" : "احجز موعدًا وتصفّح العروض"}
      </button>
      <p className="mt-2 text-center text-[11px] font-medium leading-5 text-salon-charcoal/55">
        تفتح بطاقتك لدى الصالون: الحجز والعروض وقائمة الأسعار وسجل زياراتك.
      </p>
      {error ? (
        <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
