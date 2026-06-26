"use client";

import { FormEvent, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

export default function PlatformLoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/platform/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string; redirectTo?: string };
    if (!response.ok) {
      setError(data.message ?? "بيانات الدخول غير صحيحة");
      setLoading(false);
      return;
    }
    window.location.href = data.redirectTo ?? "/platform";
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-sidebar-onyx px-5 py-8 text-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="animate-glow absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-salon-gold/20 blur-3xl" />
        <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-salon-gold/60 to-transparent" />
      </div>
      <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="mb-8">
          <BrandLogo className="mb-6 h-20 w-20 ring-1 ring-salon-gold/30" priority />
          <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-goldlight">منصّة تنال</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight">
            دخول <span className="text-gold-sheen">مدير المنصّة</span>
          </h1>
          <p className="mt-3 text-sm leading-7 text-white/60">إدارة المؤسسات والباقات على مستوى المنصّة بالكامل.</p>
        </div>
        <form onSubmit={submit} className="relative space-y-4 rounded-2xl border border-white/10 bg-white/95 p-6 text-salon-ink shadow-[0_40px_90px_-40px_rgba(0,0,0,0.75)]">
          <span className="absolute inset-x-0 top-0 h-1 bg-royal-gold" aria-hidden="true" />
          <label className="block text-sm font-semibold">
            البريد الإلكتروني
            <input name="email" type="email" required autoComplete="email" dir="ltr" className="dashboard-field mt-2" />
          </label>
          <label className="block text-sm font-semibold">
            كلمة المرور
            <input name="password" type="password" required autoComplete="current-password" className="dashboard-field mt-2" />
          </label>
          {error ? <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
          <button type="submit" disabled={loading} aria-busy={loading} className="dashboard-button-gold w-full py-3.5 text-base">
            {loading ? "جاري الدخول..." : "دخول"}
          </button>
        </form>
      </section>
    </main>
  );
}
