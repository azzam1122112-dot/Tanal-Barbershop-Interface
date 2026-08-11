"use client";

import { FormEvent, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { useHydrated } from "@/components/use-hydrated";

// دعوة التثبيت انتقلت إلى `components/barber/pwa.tsx` المركّب في تخطيط `/barber`:
// شريط سفلي يمكن تجاهله بدل نافذة تعترض شاشة الدخول قبل أن يكتب الحلاق رقمه.

export default function BarberLoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // الزر معطّل حتى الترطيب: ضغطة مبكرة كانت تُرسل النموذج بـ GET فينتهي رمز
  // الدخول في شريط العنوان وسجلات الخادم.
  const hydrated = useHydrated();
  const [phone, setPhone] = useState("");
  // لا معرّف مؤسسة. القائمة تظهر فقط إذا كان الجوال ورمز الدخول صحيحين في أكثر من صالون.
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [organizationId, setOrganizationId] = useState("");

  function updatePhone(value: string) {
    setPhone(value.replace(/\D/g, "").slice(0, 10));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const localPhone = phone;

    if (!/^05\d{8}$/.test(localPhone)) {
      setError("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام");
      return;
    }

    setLoading(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/barber/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: localPhone,
        pin: form.get("pin"),
        organizationId: organizationId || undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      redirectTo?: string;
      needsOrganizationChoice?: boolean;
      organizations?: { id: string; name: string }[];
    };

    if (!response.ok) {
      if (data.needsOrganizationChoice && data.organizations?.length) {
        setOrganizations(data.organizations);
        setOrganizationId(data.organizations[0].id);
      }
      setError(data.message ?? "رقم الجوال أو رمز الدخول غير صحيح");
      setLoading(false);
      return;
    }

    window.location.href = data.redirectTo ?? "/barber";
  }

  return (
    <main className="barber-shell">
      <section className="mx-auto flex min-h-[calc(100svh-9rem)] w-full min-w-0 max-w-sm flex-col justify-center">
        <div className="sheen-overlay overflow-hidden rounded-2xl border border-salon-ink/10 bg-white shadow-[0_30px_70px_-30px_rgba(16,25,22,0.45)]">
          <div className="relative overflow-hidden bg-sidebar-onyx px-5 py-6 text-white">
            <span className="absolute inset-x-0 top-0 h-1 bg-royal-gold" aria-hidden="true" />
            <span className="animate-glow pointer-events-none absolute -top-16 left-[-10%] h-44 w-44 rounded-full bg-salon-gold/25 blur-2xl" aria-hidden="true" />
            <span className="animate-glow pointer-events-none absolute -bottom-20 right-[-10%] h-40 w-40 rounded-full bg-salon-forest/30 blur-2xl" style={{ animationDelay: "1.5s" }} aria-hidden="true" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <BrandLogo className="animate-float h-12 w-12 ring-1 ring-salon-gold/30" priority />
                <span className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-goldlight">منصة XMANSX</span>
              </div>
              <span className="h-2 w-2 rounded-full bg-salon-gold shadow-[0_0_12px_2px_rgba(169,130,69,0.6)]" />
            </div>
            <h1 className="relative mt-10 text-3xl font-bold leading-tight tracking-tight">
              دخول <span className="text-gold-sheen">الحلاق</span>
            </h1>
          </div>
          <form onSubmit={submit} className="space-y-4 px-5 py-6">
            {organizations.length > 0 ? (
              <label className="block text-sm font-bold">
                اختر صالونك
                <select
                  value={organizationId}
                  onChange={(event) => setOrganizationId(event.target.value)}
                  autoFocus
                  className="barber-field mt-2 h-12 text-center text-base"
                >
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-center text-xs font-medium text-salon-charcoal/60">
                  رقمك مسجّل في أكثر من صالون — اختر صالونك.
                </span>
              </label>
            ) : null}
            <label className="block text-sm font-bold">
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
                placeholder="05xxxxxxxx"
                className="barber-field mt-2 h-14 text-xl"
              />
            </label>
            <label className="block text-sm font-bold">
              رمز الدخول
              <input
                name="pin"
                type="password"
                required
                minLength={8}
                maxLength={64}
                autoComplete="current-password"
                placeholder="8 خانات على الأقل"
                className="barber-field mt-2 h-14 text-center text-xl"
              />
            </label>
            {error ? <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
            <button
              type="submit"
              disabled={loading || !hydrated}
              aria-busy={loading}
              className="barber-gold-button sheen-overlay h-14 w-full text-lg"
            >
              {loading ? "جاري الدخول..." : hydrated ? "دخول" : "جاري التحضير..."}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
