"use client";

import { FormEvent, useState } from "react";

type JoinState =
  | { kind: "idle" }
  | { kind: "created"; portalPath: string }
  | { kind: "already" }
  | { kind: "error"; message: string };

export function LoyaltyJoinForm({ organizationSlug }: { organizationSlug?: string }) {
  const [state, setState] = useState<JoinState>({ kind: "idle" });
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setState({ kind: "idle" });
    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/public/loyalty/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        phone: form.get("phone"),
        whatsappTransactionalOptIn: form.get("whatsappTransactionalOptIn") === "on",
        whatsappMarketingOptIn: form.get("whatsappMarketingOptIn") === "on",
        ...(organizationSlug ? { organizationSlug } : {}),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      outcome?: string;
      portalPath?: string;
      message?: string;
    };

    if (response.ok && data.outcome === "CREATED" && data.portalPath) {
      setState({ kind: "created", portalPath: data.portalPath });
    } else if (response.ok && data.outcome === "ALREADY_REGISTERED") {
      setState({ kind: "already" });
    } else {
      setState({ kind: "error", message: data.message ?? "تعذر التسجيل" });
    }
    setLoading(false);
  }

  if (state.kind === "created") {
    return (
      <div className="barber-card px-6 py-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-salon-forest/10 text-3xl text-salon-forest">
          ✓
        </div>
        <h2 className="mt-4 text-2xl font-bold">تم تسجيلك</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-salon-charcoal">
          احفظ الرابط التالي — منه تتابع نقاطك ومكافآتك في أي وقت.
        </p>
        <a href={state.portalPath} className="mt-6 block rounded-2xl bg-salon-ink py-4 text-lg font-bold text-white">
          فتح صفحة نقاطي
        </a>
        <p className="mt-3 text-xs font-semibold text-salon-charcoal/70">
          أضف الصفحة إلى شاشتك الرئيسية للوصول السريع.
        </p>
      </div>
    );
  }

  if (state.kind === "already") {
    return (
      <div className="rounded-2xl border border-salon-gold/35 bg-salon-gold/[0.09] px-6 py-8 text-center shadow-[var(--shadow-sm)]">
        <h2 className="text-xl font-bold">رقمك مسجّل لدينا</h2>
        <p className="mt-3 text-sm font-semibold leading-7 text-salon-charcoal">
          أنت عضو في برنامج الولاء بالفعل. اطلب رابط صفحة نقاطك من الحلاق عند زيارتك القادمة — لا نرسله هنا حفاظًا على
          خصوصية بياناتك.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="mt-6 w-full rounded-2xl border border-salon-line bg-white py-3 font-bold text-salon-charcoal"
        >
          تسجيل رقم آخر
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="barber-card px-6 py-7">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-salon-charcoal">الاسم</span>
          <input name="name" required minLength={2} maxLength={60} placeholder="اسمك" className="barber-field" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-salon-charcoal">رقم الجوال</span>
          <input
            name="phone"
            required
            inputMode="numeric"
            minLength={10}
            maxLength={10}
            pattern="05[0-9]{8}"
            autoComplete="tel"
            placeholder="05xxxxxxxx"
            dir="ltr"
            onInput={(event) => {
              event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 10);
            }}
            className="barber-field text-left"
          />
        </label>
      </div>

      <fieldset className="mt-5 space-y-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
        <legend className="px-2 text-sm font-bold text-violet-950">تفضيلات التواصل</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white px-3 py-3 shadow-sm">
          <input name="whatsappTransactionalOptIn" type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" />
          <span><strong className="block text-sm">رسائل الخدمة والمواعيد</strong><small className="mt-1 block leading-5 text-slate-500">تأكيد الحجز وتحديثات الزيارة والنقاط.</small></span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white px-3 py-3 shadow-sm">
          <input name="whatsappMarketingOptIn" type="checkbox" className="mt-1 h-4 w-4 accent-violet-600" />
          <span><strong className="block text-sm">العروض والمكافآت</strong><small className="mt-1 block leading-5 text-slate-500">اختياري، ويمكن إيقافه في أي وقت.</small></span>
        </label>
      </fieldset>

      {state.kind === "error" ? (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{state.message}</p>
      ) : null}

      <button disabled={loading} className="barber-primary-button mt-6 h-14 w-full text-lg">
        {loading ? "جاري التسجيل..." : "انضم لبرنامج الولاء"}
      </button>

      <p className="mt-4 text-center text-xs font-semibold leading-6 text-salon-charcoal/70">التسجيل في الولاء لا يفعّل رسائل واتساب تلقائيًا؛ أنت تختار نوع الرسائل بوضوح.</p>
    </form>
  );
}
