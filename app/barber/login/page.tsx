"use client";

import { FormEvent, useState } from "react";

export default function BarberLoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/barber/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: form.get("phone"),
        pin: form.get("pin"),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { message?: string; redirectTo?: string };

    if (!response.ok) {
      setError(data.message ?? "رقم الجوال أو رمز الدخول غير صحيح");
      setLoading(false);
      return;
    }

    window.location.href = data.redirectTo ?? "/barber";
  }

  return (
    <main className="min-h-screen bg-salon-ink px-5 py-6 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-sm flex-col justify-center">
        <div className="mb-8">
          <p className="text-sm font-bold text-salon-gold">TANAL</p>
          <h1 className="mt-2 text-4xl font-bold leading-tight">تطبيق الحلاق</h1>
          <p className="mt-2 text-sm text-white/70">الدخول مخصص للحلاقين فقط.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-white/10 bg-white p-5 text-salon-ink shadow-2xl">
          <label className="block text-sm font-semibold">
            رقم الجوال
            <input
              name="phone"
              inputMode="tel"
              required
              autoComplete="tel"
              placeholder="05xxxxxxxx"
              className="mt-2 h-14 w-full rounded-md border border-salon-line px-3 text-xl font-bold outline-none focus:border-salon-gold"
            />
          </label>
          <label className="block text-sm font-semibold">
            رمز الدخول
            <input
              name="pin"
              inputMode="numeric"
              required
              minLength={4}
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="1234"
              className="mt-2 h-14 w-full rounded-md border border-salon-line px-3 text-center text-2xl font-bold outline-none focus:border-salon-gold"
            />
          </label>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="h-14 w-full rounded-md bg-salon-gold px-4 text-lg font-bold text-salon-ink transition disabled:opacity-60"
          >
            {loading ? "جاري الدخول..." : "دخول"}
          </button>
        </form>
      </section>
    </main>
  );
}
