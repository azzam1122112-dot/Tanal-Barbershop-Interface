"use client";

import { FormEvent, useState } from "react";

export default function BarberLoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("05");

  function updatePhone(value: string) {
    const digits = value.replace(/\D/g, "");
    const localPhone = digits.startsWith("9665") ? `0${digits.slice(3)}` : digits.startsWith("5") ? `0${digits}` : digits;
    setPhone(localPhone.startsWith("05") ? localPhone.slice(0, 10) : `05${localPhone.replace(/^0+/, "")}`.slice(0, 10));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!/^05\d{8}$/.test(phone)) {
      setError("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام");
      return;
    }

    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/barber/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
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
    <main className="barber-shell px-5 py-6">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[21.875rem] min-w-0 flex-col justify-center sm:max-w-md">
        <div className="mb-4 w-full overflow-hidden rounded-lg border border-salon-ink/10 bg-salon-ink p-5 text-white shadow-[0_24px_58px_rgba(16,25,22,0.18)]">
          <div className="flex items-center justify-between">
            <p className="rounded-full border border-salon-gold/45 bg-salon-gold/15 px-3 py-1 text-sm font-black text-salon-gold">حلاق تنال</p>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/70">واجهة الحلاق</span>
          </div>
          <h1 className="mt-6 break-words text-2xl font-black leading-tight sm:text-4xl">واجهة تنال للحلاقة الرجالية</h1>
          <p className="mt-3 text-sm leading-7 text-white/68">دخول الحلاقين لإدارة العملاء والزيارات وجلسة الصندوق بأسلوب هادئ وسريع.</p>
          <div className="mt-6 grid grid-cols-3 gap-2 text-center text-xs font-bold text-white/78">
            <span className="rounded-lg border border-white/10 bg-white/10 px-2 py-3">عميل</span>
            <span className="rounded-lg border border-white/10 bg-white/10 px-2 py-3">صندوق</span>
            <span className="rounded-lg border border-white/10 bg-white/10 px-2 py-3">حلاقة</span>
          </div>
        </div>
        <form onSubmit={submit} className="barber-card w-full space-y-4 p-5">
          <label className="block text-sm font-semibold">
            رقم الجوال
            <input
              name="phone"
              value={phone}
              onChange={(event) => updatePhone(event.target.value)}
              inputMode="numeric"
              required
              minLength={10}
              maxLength={10}
              pattern="05[0-9]{8}"
              autoComplete="tel"
              placeholder="0555967209"
              className="barber-field mt-2 h-14 text-xl"
            />
            <span className="mt-2 block text-xs font-semibold text-salon-charcoal/65">مثال: 0555967209</span>
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
              className="barber-field mt-2 h-14 text-center text-2xl"
            />
          </label>
          {error ? <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="barber-primary-button h-14 w-full text-lg"
          >
            {loading ? "جاري الدخول..." : "دخول"}
          </button>
          <p className="text-center text-xs font-semibold text-salon-charcoal/70">الدخول مخصص للحلاقين فقط.</p>
        </form>
      </section>
    </main>
  );
}
