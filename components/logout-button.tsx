"use client";

import { useState } from "react";
import { DashboardToast, type ToastState } from "@/components/ui/toast";
import { safeFetch } from "@/lib/http/safe-fetch";

export function LogoutButton({ className = "" }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  // إشعار لا سطرًا داخل المكوّن: الزر يقف في صفّ مرن على ترويسة الحلاق الفاتحة
  // وفي عمود داكن على الشريط الجانبي، فسطرٌ تحته يزيح أحدهما ويتعذّر لونه في الآخر.
  const [toast, setToast] = useState<ToastState | null>(null);

  async function logout() {
    setLoading(true);
    try {
      const response = await safeFetch("/api/auth/logout", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { redirectTo?: string; message?: string };

      // المغادرة كانت تتم سواء نجح إبطال الجلسة أو فشل. الجلسة تبقى صالحة على
      // الخادم بينما يظنّ صاحبها أنه خرج — وهو أسوأ ما يكون على جهاز يتقاسمه حلاقان.
      if (!response.ok) {
        setToast({
          message: data.message ?? "لم يكتمل تسجيل الخروج — جلستك ما زالت مفتوحة، أعد المحاولة",
          tone: "error",
        });
        setLoading(false);
        return;
      }

      window.location.href = data.redirectTo ?? "/dashboard/login";
    } catch {
      setToast({ message: "انقطع الاتصال — جلستك ما زالت مفتوحة، أعد المحاولة", tone: "error" });
      setLoading(false);
    }
  }

  return (
    <>
      <DashboardToast toast={toast} onClose={() => setToast(null)} />
      <button
        type="button"
        onClick={logout}
        disabled={loading}
        aria-busy={loading}
        className={`rounded-md border border-salon-line px-4 py-2 text-sm font-semibold text-salon-charcoal transition hover:border-salon-gold disabled:opacity-60 ${className}`}
      >
        {loading ? "جاري الخروج..." : "تسجيل الخروج"}
      </button>
    </>
  );
}
