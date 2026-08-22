"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeFetch } from "@/lib/http/safe-fetch";

/**
 * لوح الانضمام لمؤسسة.
 *
 * **حالتان لا نموذج تسجيل:** التسجيل الذاتي في الولاء يبدأ دائمًا من الحساب
 * الموحّد، فلا يُنشأ عميل مؤسسة بلا هوية عالمية. من لا جلسة له يذهب للتسجيل أو
 * الدخول والمؤسسة محمولة معه في سياق موقّع؛ ومن له جلسة يضغط زرًا واحدًا.
 */
export function JoinOrganizationPanel({
  state,
  brandName,
  accountName,
}: {
  state: string;
  brandName: string;
  accountName: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  const authQuery = `?join=${encodeURIComponent(state)}`;

  async function enroll() {
    setLoading(true);
    setFeedback(null);
    try {
      const response = await safeFetch("/api/account/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; redirectTo?: string };

      if (!response.ok) {
        setFeedback({ tone: "error", message: data.message ?? "تعذر إتمام الانضمام" });
        return;
      }
      setFeedback({ tone: "success", message: data.message ?? "تم الانضمام." });
      if (data.redirectTo) {
        router.push(data.redirectTo);
        router.refresh();
      }
    } catch {
      setFeedback({ tone: "error", message: "تعذر الاتصال بالخادم" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/[0.13] bg-[#1d1729]/80 p-5 shadow-2xl backdrop-blur sm:p-7">
      <h2 className="text-lg font-bold text-white sm:text-xl">انضم إلى برنامج ولاء {brandName}</h2>

      {accountName ? (
        <div className="mt-5 space-y-4">
          <p className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 py-3 text-sm font-medium leading-6 text-white/70">
            أنت مسجّل الدخول باسم <span className="font-bold text-white">{accountName}</span>.
          </p>
          <button
            type="button"
            onClick={enroll}
            disabled={loading}
            className="w-full rounded-xl bg-violet-400 px-4 py-3.5 text-base font-bold text-[#1a1424] transition hover:bg-violet-300 disabled:opacity-60"
          >
            {loading ? "جارٍ الانضمام…" : "انضم الآن"}
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium leading-7 text-white/60">
            حساب واحد على منصة إكس مانس إكس يكفي لكل الصالونات المشتركة. بعد الدخول يكتمل انضمامك لهذا الصالون.
          </p>
          <Link
            href={`/account/register${authQuery}`}
            className="block w-full rounded-xl bg-violet-400 px-4 py-3.5 text-center text-base font-bold text-[#1a1424] transition hover:bg-violet-300"
          >
            إنشاء حساب
          </Link>
          <Link
            href={`/account/login${authQuery}`}
            className="block w-full rounded-xl border border-white/[0.16] px-4 py-3.5 text-center text-base font-bold text-white transition hover:border-violet-300/60"
          >
            لدي حساب — تسجيل الدخول
          </Link>
        </div>
      )}

      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-4 rounded-xl px-3.5 py-3 text-sm font-semibold ${
            feedback.tone === "error" ? "bg-red-500/15 text-red-200" : "bg-emerald-400/15 text-emerald-200"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      {/* اسم المنشأة يكفي لتعريف المتحكم. بيانات دخول المالك قد تكون شخصية،
          وعرضها لكل من يمسح رمز الصالون كان يحوّل ملصق الولاء إلى دليل اتصال
          غير مقصود. قنوات الحقوق الرسمية تبقى في سياسة الخصوصية وداخل الحساب. */}
      <p className="mt-5 border-t border-white/[0.08] pt-4 text-[11px] font-medium leading-5 text-white/35">
        يعالج {brandName} بيانات عضويتك بصفته المسؤول عنها، وتعمل إكس مانس إكس XMANSX مزوّدًا تقنيًا للخدمة.
      </p>
    </section>
  );
}
