"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { formatDate } from "@/lib/format";
import { absoluteBrowserUrl } from "@/lib/public-url";

type CreatedAccount = {
  slug: string;
  redirectTo: string;
  loginUrl: string;
  email: string;
  phone: string;
  password: string;
  planName: string;
  trialDays: number;
  trialEndsAt: string | null;
};

export default function SignupPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showCreatedPassword, setShowCreatedPassword] = useState(false);
  const [copied, setCopied] = useState("");
  const [trial, setTrial] = useState<{ name: string; days: number } | null>(null);
  const [created, setCreated] = useState<CreatedAccount | null>(null);

  useEffect(() => {
    void fetch("/api/auth/signup")
      .then((response) => response.json())
      .then((data: { plan?: { name?: string; trialDays?: number } }) => {
        if (data.plan?.name && data.plan.trialDays) setTrial({ name: data.plan.name, days: data.plan.trialDays });
      })
      .catch(() => undefined);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const salonName = String(form.get("salonName") ?? "");
    const password = String(form.get("password") ?? "");
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        organizationName: salonName,
        salonName,
        ownerName: form.get("ownerName"),
        city: form.get("city"),
        email: form.get("email"),
          phone: form.get("phone"),
          password: form.get("password"),
          acceptPolicies: form.get("acceptPolicies") === "on",
          acceptDataProcessingAgreement: form.get("acceptDataProcessingAgreement") === "on",
        }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      redirectTo?: string;
      loginPath?: string;
      slug?: string;
      ownerEmail?: string;
      ownerPhone?: string;
      planName?: string;
      trialDays?: number;
      trialEndsAt?: string | null;
    };
    if (!response.ok) {
      setError(data.message ?? "تعذر إنشاء الحساب");
      setLoading(false);
      return;
    }
    setCreated({
      slug: data.slug ?? "",
      redirectTo: data.redirectTo ?? "/dashboard",
      loginUrl: absoluteBrowserUrl(data.loginPath ?? "/dashboard/login", window.location.origin),
      email: data.ownerEmail ?? String(form.get("email") ?? ""),
      phone: data.ownerPhone ?? String(form.get("phone") ?? ""),
      password,
      planName: data.planName ?? trial?.name ?? "الباقة التجريبية",
      trialDays: data.trialDays ?? trial?.days ?? 14,
      trialEndsAt: data.trialEndsAt ?? null,
    });
    setLoading(false);
  }

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-sidebar-onyx px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="animate-glow absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-salon-gold/20 blur-3xl" />
        <div className="animate-glow absolute bottom-[-15%] left-[-10%] h-96 w-96 rounded-full bg-salon-forest/25 blur-3xl" style={{ animationDelay: "2s" }} />
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-salon-gold/60 to-transparent" />
      </div>

      <Link href="/" className="relative z-10 inline-flex items-center gap-1.5 text-xs font-bold text-white/55 transition-colors hover:text-white">
        <span aria-hidden="true">→</span> العودة للرئيسية
      </Link>

      <section className="relative mx-auto flex min-h-[calc(100vh-7rem)] max-w-lg flex-col justify-center">
        {created ? (
          <div className="sheen-overlay relative space-y-5 rounded-2xl border border-white/10 bg-white/95 p-7 text-salon-ink shadow-[0_40px_90px_-40px_rgba(0,0,0,0.75)]">
            <span className="absolute inset-x-0 top-0 h-1 bg-royal-gold" aria-hidden="true" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-gold">تم الإنشاء بنجاح</p>
              <h2 className="mt-2 text-2xl font-bold leading-tight">صالونك جاهز واشتراكك مفعّل 🎉</h2>
              <p className="mt-2 text-sm leading-7 text-salon-charcoal/80">
                تم تفعيل {created.planName} لمدة {created.trialDays} يومًا
                {created.trialEndsAt ? ` حتى ${formatDate(created.trialEndsAt)}` : ""}. احتفظ ببيانات الدخول التالية.
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-salon-line bg-salon-mist">
              <CredentialRow label="البريد للدخول" value={created.email} onCopy={() => void copyValue("email", created.email)} copied={copied === "email"} />
              <CredentialRow label="رقم الجوال" value={created.phone} onCopy={() => void copyValue("phone", created.phone)} copied={copied === "phone"} />
              <CredentialRow
                label="كلمة المرور"
                value={showCreatedPassword ? created.password : "••••••••"}
                onCopy={() => void copyValue("password", created.password)}
                copied={copied === "password"}
                extra={<button type="button" onClick={() => setShowCreatedPassword((value) => !value)} className="text-[11px] font-bold text-salon-gold">{showCreatedPassword ? "إخفاء" : "إظهار"}</button>}
              />
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-4">
              <p className="text-xs font-bold text-violet-700">رابط الدخول الدائم</p>
              <a href={created.loginUrl} dir="ltr" className="mt-1 block break-all text-sm font-bold text-violet-950 hover:underline">{created.loginUrl}</a>
              <button type="button" onClick={() => void copyValue("link", created.loginUrl)} className="mt-2 text-xs font-bold text-violet-700">{copied === "link" ? "تم نسخ الرابط" : "نسخ رابط الدخول"}</button>
            </div>
            <button
              type="button"
              onClick={() => { window.location.href = created.redirectTo; }}
              className="dashboard-button-gold sheen-overlay w-full py-3.5 text-base"
            >
              الدخول الآن إلى لوحة الإدارة
            </button>
          </div>
        ) : (
        <>
        <div className="mb-7">
          <BrandLogo className="animate-float mb-6 h-20 w-20 ring-1 ring-salon-gold/30" priority />
          <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-goldlight">{trial ? `${trial.days} يومًا مجانًا` : "ابدأ مجانًا"}</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            أنشئ <span className="text-gold-sheen">حساب نشاطك</span>
          </h1>
          <p className="mt-3 text-sm leading-7 text-white/60">سجّل بيانات صالونك وسيُفعّل حساب المالك والباقة التجريبية مباشرة.</p>
        </div>

        <form onSubmit={submit} className="sheen-overlay relative space-y-4 rounded-2xl border border-white/10 bg-white/95 p-6 text-salon-ink shadow-[0_40px_90px_-40px_rgba(0,0,0,0.75)]">
          <span className="absolute inset-x-0 top-0 h-1 bg-royal-gold" aria-hidden="true" />

          <label className="block text-sm font-semibold">
            اسم الصالون
            <input name="salonName" required minLength={2} className="dashboard-field mt-2" placeholder="مثال: صالون الرؤية" />
          </label>

          <label className="block text-sm font-semibold">
            اسم المالك
            <input name="ownerName" required className="dashboard-field mt-2" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              المدينة
              <input name="city" required minLength={2} className="dashboard-field mt-2" placeholder="مثال: الرياض" />
            </label>
            <label className="block text-sm font-semibold">
              البريد الإلكتروني
              <input name="email" type="email" required autoComplete="email" dir="ltr" className="dashboard-field mt-2" />
            </label>
            <label className="block text-sm font-semibold sm:col-span-2">
              الجوال
              <input name="phone" inputMode="numeric" required dir="ltr" placeholder="05xxxxxxxx" className="dashboard-field mt-2" />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            كلمة المرور
            <div className="mt-2 flex items-center overflow-hidden rounded-xl border border-salon-line bg-white focus-within:border-salon-gold focus-within:ring-4 focus-within:ring-salon-gold/[0.15]">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm font-semibold outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="shrink-0 border-r border-salon-line bg-salon-mist px-3 py-3 text-xs font-bold text-salon-charcoal/70 transition-colors hover:text-salon-ink"
              >
                {showPassword ? "إخفاء" : "إظهار"}
              </button>
            </div>
            <span className="mt-1 block text-xs font-medium text-salon-charcoal/60">8 أحرف على الأقل.</span>
          </label>

          <fieldset className="space-y-3 rounded-xl border border-salon-line bg-salon-mist/70 p-4">
            <legend className="px-2 text-sm font-bold">الموافقات القانونية</legend>
            <label className="flex items-start gap-3 text-xs font-semibold leading-6 text-salon-charcoal">
              <input name="acceptPolicies" type="checkbox" required className="mt-1 h-4 w-4 shrink-0 accent-violet-700" />
              <span>
                قرأت وأوافق على <Link href="/terms" target="_blank" className="font-bold text-violet-800 underline">شروط الاشتراك</Link>
                {" "}و<Link href="/privacy" target="_blank" className="font-bold text-violet-800 underline">سياسة الخصوصية</Link>
                {" "}و<Link href="/refund-policy" target="_blank" className="font-bold text-violet-800 underline">سياسة الإلغاء والاسترداد</Link>
                {" "}و<Link href="/digital-service-policy" target="_blank" className="font-bold text-violet-800 underline">سياسة تقديم الخدمة الرقمية</Link>.
              </span>
            </label>
            <label className="flex items-start gap-3 text-xs font-semibold leading-6 text-salon-charcoal">
              <input name="acceptDataProcessingAgreement" type="checkbox" required className="mt-1 h-4 w-4 shrink-0 accent-violet-700" />
              <span>
                بصفتي مالك الحساب، أقبل <Link href="/data-processing-agreement" target="_blank" className="font-bold text-violet-800 underline">اتفاقية معالجة البيانات</Link>
                {" "}وأقر بأن الصالون جهة التحكم في بيانات زبائنه.
              </span>
            </label>
          </fieldset>

          {error ? <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

          <button type="submit" disabled={loading} aria-busy={loading} className="dashboard-button-gold sheen-overlay w-full py-3.5 text-base">
            {loading ? "جاري إنشاء وتفعيل الحساب..." : trial ? `ابدأ التجربة المجانية ${trial.days} يومًا` : "إنشاء الصالون والبدء"}
          </button>
          <p className="text-center text-xs font-medium text-salon-charcoal/70">
            لديك حساب؟ <Link href="/dashboard/login" className="font-bold text-salon-gold hover:underline">دخول الإدارة</Link>
          </p>
        </form>
        </>
        )}
      </section>
    </main>
  );
}

function CredentialRow({
  label,
  value,
  copied,
  onCopy,
  extra,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-salon-line px-4 py-3 last:border-0">
      <div className="min-w-0"><p className="text-[11px] font-bold text-salon-charcoal/60">{label}</p><p dir="ltr" className="mt-1 truncate text-sm font-bold text-salon-ink">{value}</p></div>
      <div className="flex shrink-0 items-center gap-2">{extra}<button type="button" onClick={onCopy} className="rounded-lg border border-salon-line bg-white px-2.5 py-1.5 text-[11px] font-bold text-salon-charcoal">{copied ? "تم النسخ" : "نسخ"}</button></div>
    </div>
  );
}
