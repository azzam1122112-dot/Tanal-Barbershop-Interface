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
        <div className="mb-7 rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,#17130f_0%,#24211d_58%,#1f4a3d_100%)] p-5 shadow-2xl shadow-black/30">
          <div className="flex items-center justify-between">
            <p className="rounded-full border border-salon-gold/40 px-3 py-1 text-sm font-black tracking-[0.22em] text-salon-gold">TANAL</p>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/75">صالون رجالي</span>
          </div>
          <h1 className="mt-6 text-4xl font-black leading-tight">واجهة تنال للحلاقة الرجالية</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">دخول سريع وآمن لتسجيل العملاء والزيارات داخل جلسة الصندوق.</p>
          <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs font-bold text-white/75">
            <span className="rounded-2xl bg-white/10 px-2 py-3">جوال</span>
            <span className="rounded-2xl bg-white/10 px-2 py-3">جلسة صندوق</span>
            <span className="rounded-2xl bg-white/10 px-2 py-3">زيارات</span>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-[1.5rem] border border-white/15 bg-salon-pearl p-5 text-salon-ink shadow-2xl shadow-black/30">
          <label className="block text-sm font-semibold">
            رقم الجوال
            <input
              name="phone"
              inputMode="tel"
              required
              autoComplete="tel"
              placeholder="05xxxxxxxx"
              className="mt-2 h-14 w-full rounded-2xl border border-salon-line bg-white px-4 text-xl font-black outline-none transition focus:border-salon-gold focus:ring-4 focus:ring-salon-gold/15"
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
              className="mt-2 h-14 w-full rounded-2xl border border-salon-line bg-white px-4 text-center text-2xl font-black tracking-[0.35em] outline-none transition focus:border-salon-gold focus:ring-4 focus:ring-salon-gold/15"
            />
          </label>
          {error ? <p className="rounded-2xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="h-14 w-full rounded-2xl bg-salon-gold px-4 text-lg font-black text-salon-ink shadow-lg shadow-salon-gold/25 transition active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "جاري الدخول..." : "دخول"}
          </button>
          <p className="text-center text-xs font-semibold text-salon-charcoal/70">الدخول مخصص للحلاقين فقط.</p>
        </form>
      </section>
    </main>
  );
}
