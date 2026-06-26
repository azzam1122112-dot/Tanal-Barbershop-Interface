"use client";

import { FormEvent, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

export default function DashboardLoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/dashboard/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string; redirectTo?: string };

    if (!response.ok) {
      setError(data.message ?? "بيانات الدخول غير صحيحة");
      setLoading(false);
      return;
    }

    window.location.href = data.redirectTo ?? "/dashboard";
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-sidebar-onyx px-5 py-8 text-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-salon-gold/12 blur-3xl" />
        <div className="absolute bottom-[-15%] left-[-10%] h-96 w-96 rounded-full bg-salon-forest/20 blur-3xl" />
      </div>
      <section className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="mb-8">
          <BrandLogo className="mb-5 h-24 w-24 ring-1 ring-salon-gold/25" priority />
          <p className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-goldlight">حلاق تنال</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight">دخول إدارة الحلاقة الرجالية</h1>
          <p className="mt-3 text-sm leading-7 text-white/65">ادخل إلى لوحة التشغيل لمتابعة اليوم وإدارة الفريق والعملاء.</p>
        </div>
        <form onSubmit={submit} className="relative space-y-4 overflow-hidden rounded-2xl border border-white/10 bg-white/95 p-6 text-salon-ink shadow-[0_40px_90px_-40px_rgba(0,0,0,0.7)] backdrop-blur">
          <span className="absolute inset-x-0 top-0 h-1 bg-gold-sheen" aria-hidden="true" />
          <label className="block text-sm font-semibold">
            البريد الإلكتروني
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="dashboard-field mt-2"
            />
          </label>
          <label className="block text-sm font-semibold">
            كلمة المرور
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="dashboard-field mt-2"
            />
          </label>
          {error ? <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="dashboard-button-gold w-full"
          >
            {loading ? "جاري الدخول..." : "دخول"}
          </button>
        </form>
      </section>
    </main>
  );
}
