"use client";

import { FormEvent, type ReactNode, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { safeFetch } from "@/lib/http/safe-fetch";

/**
 * نماذج مصادقة العميل.
 *
 * التحقق الفعلي كله في الخادم؛ ما هنا عرض ورسائل. الحقول تحمل `autoComplete`
 * و`inputMode` الصحيحين فتملأها إدارة كلمات المرور وتفتح لوحة الأرقام للجوال
 * والرمز — الاحتكاك في شاشة دخول يُقاس بعدد الضغطات لا بجمال الحقل.
 */

type Feedback = { tone: "error" | "success"; message: string } | null;

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  inputMode,
  hint,
  defaultValue,
  readOnly,
  pattern,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
  hint?: string;
  defaultValue?: string;
  readOnly?: boolean;
  pattern?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-salon-ink">{label}</span>
      <input
        name={name}
        type={type}
        required
        readOnly={readOnly}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        inputMode={inputMode}
        pattern={pattern}
        maxLength={maxLength}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className="w-full rounded-xl border border-salon-line bg-white px-3.5 py-3 text-base font-medium text-salon-ink outline-none transition focus:border-salon-gold focus:ring-2 focus:ring-salon-gold/25 read-only:bg-salon-mist/60"
      />
      {hint ? (
        <span id={`${name}-hint`} className="mt-1.5 block text-xs font-medium text-salon-charcoal/60">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Alert({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const tone =
    feedback.tone === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <p role="status" aria-live="polite" className={`rounded-xl border px-3.5 py-3 text-sm font-semibold ${tone}`}>
      {feedback.message}
    </p>
  );
}

function Submit({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-xl bg-salon-ink px-4 py-3.5 text-base font-bold text-white transition hover:bg-salon-charcoal disabled:opacity-60"
    >
      {loading ? "جارٍ المعالجة…" : children}
    </button>
  );
}

/**
 * يرسل النموذج ويوحّد قراءة الرد: رسالة، أو تحويل، أو خطأ.
 *
 * `join` سياق موقّع يُمرَّر كما هو ولا يُفكّ في المتصفح — الواجهة لا تعرف أي
 * مؤسسة يحمل، والخادم وحده يتحقق منه ويحلّه ويقرر وجهة العودة.
 */
function useSubmit(endpoint: string, join?: string | null) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function submit(event: FormEvent<HTMLFormElement>, transform?: (form: FormData) => Record<string, unknown>) {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);
    const form = new FormData(event.currentTarget);
    const payload = { ...(transform ? transform(form) : Object.fromEntries(form.entries())), ...(join ? { join } : {}) };

    try {
      const response = await safeFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; redirectTo?: string };

      if (response.ok) {
        if (data.message) setFeedback({ tone: "success", message: data.message });
        if (data.redirectTo) {
          // انتقال مصادقة كامل: يضمن أن الصفحة التالية تقرأ كوكي الجلسة أو
          // حالة التحقق الجديدة، ولا يبقى المستخدم في النموذج بسبب RSC قديم.
          window.location.assign(data.redirectTo);
          return;
        }
      } else {
        setFeedback({ tone: "error", message: data.message ?? "تعذر إتمام الطلب" });
        if (data.redirectTo) window.location.assign(data.redirectTo);
      }
    } catch {
      setFeedback({ tone: "error", message: "تعذر الاتصال بالخادم" });
    } finally {
      setLoading(false);
    }
  }

  return { submit, loading, feedback, setFeedback };
}

export function AccountRegisterForm({ join }: { join?: string | null }) {
  const { submit, loading, feedback } = useSubmit("/api/account/register", join);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="الاسم" name="name" autoComplete="name" />
      <Field label="رقم الجوال" name="phone" type="tel" inputMode="tel" autoComplete="tel" hint="للتواصل فقط. الدخول يكون بالبريد." />
      <Field label="البريد الإلكتروني" name="email" type="email" inputMode="email" autoComplete="email" />
      <Field label="كلمة المرور" name="password" type="password" autoComplete="new-password" hint="8 أحرف على الأقل. العبارات الطويلة أقوى وأسهل حفظًا." />
      <Field label="تأكيد كلمة المرور" name="confirmPassword" type="password" autoComplete="new-password" />
      <Alert feedback={feedback} />
      <Submit loading={loading}>إنشاء الحساب</Submit>
      <p className="text-center text-sm font-medium text-salon-charcoal/70">
        لديك حساب؟{" "}
        <Link href={join ? `/account/login?join=${encodeURIComponent(join)}` : "/account/login"} className="font-bold text-salon-ink underline">
          سجّل الدخول
        </Link>
      </p>
    </form>
  );
}

export function AccountLoginForm({
  join,
  showRegisterLink = true,
}: {
  join?: string | null;
  showRegisterLink?: boolean;
}) {
  const { submit, loading, feedback } = useSubmit("/api/account/login", join);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {/* بالبريد وحده: توثيق البريد يثبت البريد، ولا وسيلة اليوم تثبت ملكية رقم. */}
      <Field label="البريد الإلكتروني" name="identifier" type="email" inputMode="email" autoComplete="username email" />
      <Field label="كلمة المرور" name="password" type="password" autoComplete="current-password" />
      <Alert feedback={feedback} />
      <Submit loading={loading}>تسجيل الدخول</Submit>
      <div className={`flex items-center text-sm font-medium text-salon-charcoal/70 ${showRegisterLink ? "justify-between" : "justify-center"}`}>
        <Link href="/account/forgot-password" className="font-bold text-salon-ink underline">
          نسيت كلمة المرور؟
        </Link>
        {showRegisterLink ? (
          <Link href={join ? `/account/register?join=${encodeURIComponent(join)}` : "/account/register"} className="font-bold text-salon-ink underline">
            حساب جديد
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function AccountVerifyForm({ email, join }: { email: string; join?: string | null }) {
  const { submit, loading, feedback, setFeedback } = useSubmit("/api/account/verify", join);
  const [resending, setResending] = useState(false);

  async function resend() {
    setResending(true);
    setFeedback(null);
    try {
      const response = await safeFetch("/api/account/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      setFeedback({ tone: response.ok ? "success" : "error", message: data.message ?? "تعذر إرسال الرمز" });
    } catch {
      setFeedback({ tone: "error", message: "تعذر الاتصال بالخادم" });
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="البريد الإلكتروني" name="email" type="email" defaultValue={email} readOnly={Boolean(email)} autoComplete="email" />
      <Field label="رمز التفعيل" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} hint="ست خانات، صالحة عشر دقائق ولاستعمال واحد." />
      <Alert feedback={feedback} />
      <Submit loading={loading}>تفعيل الحساب</Submit>
      <button
        type="button"
        onClick={resend}
        disabled={resending || !email}
        className="w-full rounded-xl border border-salon-line px-4 py-3 text-sm font-bold text-salon-ink transition hover:border-salon-gold disabled:opacity-60"
      >
        {resending ? "جارٍ الإرسال…" : "إرسال رمز جديد"}
      </button>
    </form>
  );
}

export function AccountForgotPasswordForm() {
  const { submit, loading, feedback } = useSubmit("/api/account/forgot-password");

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="البريد الإلكتروني" name="email" type="email" inputMode="email" autoComplete="email" />
      <Alert feedback={feedback} />
      <Submit loading={loading}>إرسال رمز الاستعادة</Submit>
      <p className="text-center text-sm font-medium text-salon-charcoal/70">
        وصلك الرمز؟{" "}
        <Link href="/account/reset-password" className="font-bold text-salon-ink underline">
          تعيين كلمة مرور جديدة
        </Link>
      </p>
    </form>
  );
}

export function AccountResetPasswordForm({ email }: { email: string }) {
  const { submit, loading, feedback } = useSubmit("/api/account/reset-password");

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="البريد الإلكتروني" name="email" type="email" defaultValue={email} autoComplete="email" />
      <Field label="رمز الاستعادة" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} />
      <Field label="كلمة المرور الجديدة" name="password" type="password" autoComplete="new-password" hint="8 أحرف على الأقل." />
      <Field label="تأكيد كلمة المرور" name="confirmPassword" type="password" autoComplete="new-password" />
      <Alert feedback={feedback} />
      <Submit loading={loading}>تعيين كلمة المرور</Submit>
    </form>
  );
}

export function AccountLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await safeFetch("/api/account/logout", { method: "POST" }).catch(() => undefined);
        router.push("/account/login");
        router.refresh();
      }}
      className="rounded-xl border border-salon-line px-4 py-2.5 text-sm font-bold text-salon-ink transition hover:border-salon-gold disabled:opacity-60"
    >
      {loading ? "جارٍ الخروج…" : "تسجيل الخروج"}
    </button>
  );
}
