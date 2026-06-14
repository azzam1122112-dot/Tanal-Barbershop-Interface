"use client";

import { FormEvent, useState } from "react";

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
    <main className="min-h-screen bg-salon-ink px-5 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="mb-8">
          <p className="text-xs font-black tracking-[0.28em] text-salon-gold">TANAL</p>
          <h1 className="mt-3 text-4xl font-black leading-tight">دخول إدارة الحلاقة الرجالية</h1>
          <p className="mt-3 text-sm leading-7 text-white/65">ادخل إلى لوحة التشغيل لمتابعة اليوم وإدارة الفريق والعملاء.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-white/10 bg-white/95 p-5 text-salon-ink shadow-2xl shadow-black/25 backdrop-blur">
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
          {error ? <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
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
