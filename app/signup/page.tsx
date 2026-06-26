"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

export default function SignupPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [slug, setSlug] = useState("");

  function onSlug(value: string) {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName: form.get("organizationName"),
        slug: form.get("slug"),
        salonName: form.get("salonName"),
        ownerName: form.get("ownerName"),
        email: form.get("email"),
        phone: form.get("phone"),
        password: form.get("password"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string; redirectTo?: string };
    if (!response.ok) {
      setError(data.message ?? "تعذر إنشاء الحساب");
      setLoading(false);
      return;
    }
    window.location.href = data.redirectTo ?? "/dashboard";
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
        <div className="mb-7">
          <BrandLogo className="animate-float mb-6 h-20 w-20 ring-1 ring-salon-gold/30" priority />
          <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-goldlight">ابدأ مجانًا</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            أنشئ <span className="text-gold-sheen">مؤسستك</span>
          </h1>
          <p className="mt-3 text-sm leading-7 text-white/60">سجّل مؤسستك وأول صالون وحساب المالك، وابدأ التشغيل خلال دقائق.</p>
        </div>

        <form onSubmit={submit} className="sheen-overlay relative space-y-4 rounded-2xl border border-white/10 bg-white/95 p-6 text-salon-ink shadow-[0_40px_90px_-40px_rgba(0,0,0,0.75)]">
          <span className="absolute inset-x-0 top-0 h-1 bg-royal-gold" aria-hidden="true" />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              اسم المؤسسة
              <input name="organizationName" required className="dashboard-field mt-2" placeholder="مثال: صالونات تنال" />
            </label>
            <label className="block text-sm font-semibold">
              اسم أول صالون
              <input name="salonName" className="dashboard-field mt-2" placeholder="الصالون الرئيسي" />
            </label>
          </div>

          <label className="block text-sm font-semibold">
            المعرّف (النطاق الفرعي)
            <div className="mt-2 flex items-center overflow-hidden rounded-xl border border-salon-line bg-white focus-within:border-salon-gold focus-within:ring-4 focus-within:ring-salon-gold/[0.15]">
              <input
                name="slug"
                value={slug}
                onChange={(event) => onSlug(event.target.value)}
                required
                dir="ltr"
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm font-semibold outline-none"
                placeholder="my-salon"
              />
              <span dir="ltr" className="shrink-0 border-r border-salon-line bg-salon-mist px-3 py-3 text-xs font-bold text-salon-charcoal/70">.tanal.com</span>
            </div>
          </label>

          <div className="lux-rule" />

          <label className="block text-sm font-semibold">
            اسم المالك
            <input name="ownerName" required className="dashboard-field mt-2" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              البريد الإلكتروني
              <input name="email" type="email" required autoComplete="email" dir="ltr" className="dashboard-field mt-2" />
            </label>
            <label className="block text-sm font-semibold">
              الجوال
              <input name="phone" inputMode="numeric" required dir="ltr" placeholder="05xxxxxxxx" className="dashboard-field mt-2" />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            كلمة المرور
            <input name="password" type="password" required autoComplete="new-password" className="dashboard-field mt-2" />
          </label>

          {error ? <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

          <button type="submit" disabled={loading} aria-busy={loading} className="dashboard-button-gold sheen-overlay w-full py-3.5 text-base">
            {loading ? "جاري الإنشاء..." : "إنشاء المؤسسة والبدء"}
          </button>
          <p className="text-center text-xs font-medium text-salon-charcoal/70">
            لديك حساب؟ <Link href="/dashboard/login" className="font-bold text-salon-gold hover:underline">دخول الإدارة</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
