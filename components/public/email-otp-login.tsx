"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { safeFetch } from "@/lib/http/safe-fetch";

/**
 * الدخول برمز بريدي — الطريقة الاحتياطية.
 *
 * خطوتان: طلب الرمز ثم إدخاله. الرد على الطلب **محايد دائمًا** فلا تكشف الشاشة
 * أي بريد له حساب، ولذلك ننتقل لخطوة الرمز في كل الأحوال.
 */
export function EmailOtpLoginForm({ join }: { join?: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(null);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);
    const value = String(new FormData(event.currentTarget).get("email") ?? "").trim();

    try {
      const response = await safeFetch("/api/account/login/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setEmail(value);
      setStep("code");
      setFeedback({ tone: "success", message: data.message ?? "إن كان البريد مسجّلًا فسيصلك رمز." });
    } catch {
      setFeedback({ tone: "error", message: "تعذر الاتصال بالخادم" });
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();

    try {
      const response = await safeFetch("/api/account/login/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, join: join ?? undefined }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; redirectTo?: string; suggestPasskey?: boolean };

      if (!response.ok) {
        setFeedback({ tone: "error", message: data.message ?? "الرمز غير صحيح." });
        return;
      }
      // بعد النجاح على جهاز جديد نقترح تفعيل الدخول السريع عليه.
      const target = data.suggestPasskey ? "/account/passkey-setup" : data.redirectTo ?? "/account/loyalty";
      router.push(target);
      router.refresh();
    } catch {
      setFeedback({ tone: "error", message: "تعذر الاتصال بالخادم" });
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    "w-full rounded-xl border border-salon-line bg-white px-3.5 py-3 text-base font-medium text-salon-ink outline-none transition focus:border-salon-gold focus:ring-2 focus:ring-salon-gold/25";

  return (
    <form onSubmit={step === "email" ? requestCode : submitCode} className="space-y-4" noValidate>
      {step === "email" ? (
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-salon-ink">البريد الإلكتروني</span>
          <input name="email" type="email" inputMode="email" autoComplete="email" required className={fieldClass} />
        </label>
      ) : (
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-salon-ink">رمز الدخول</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            className={fieldClass}
          />
          <span className="mt-1.5 block text-xs font-medium text-salon-charcoal/60">
            ست خانات وصلت إلى {email} — صالحة عشر دقائق.
          </span>
        </label>
      )}

      {feedback ? (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-3.5 py-3 text-sm font-semibold ${
            feedback.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl border border-salon-line px-4 py-3.5 text-base font-bold text-salon-ink transition hover:border-salon-gold disabled:opacity-60"
      >
        {loading ? "جارٍ المعالجة…" : step === "email" ? "إرسال رمز إلى البريد" : "تسجيل الدخول"}
      </button>

      {step === "code" ? (
        <button
          type="button"
          onClick={() => { setStep("email"); setFeedback(null); }}
          className="w-full text-center text-sm font-bold text-salon-charcoal/70 underline"
        >
          تغيير البريد
        </button>
      ) : null}
    </form>
  );
}
