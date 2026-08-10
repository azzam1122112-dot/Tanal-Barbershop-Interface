"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { BrandLogo } from "@/components/brand-logo";

type Setup = { secret: string; otpauthUri: string };

export default function PlatformMfaSetupPage() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  useEffect(() => {
    fetch("/api/platform/auth/mfa/setup", { method: "POST" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "تعذر بدء الإعداد");
        setSetup(data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "تعذر بدء الإعداد"))
      .finally(() => setLoading(false));
  }, []);

  const qrSvg = useMemo(() => {
    if (!setup) return "";
    const qr = qrcode(0, "M");
    qr.addData(setup.otpauthUri);
    qr.make();
    return qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }, [setup]);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/platform/auth/mfa/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: form.get("code") }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.message ?? "رمز التحقق غير صحيح");
    else setRecoveryCodes(data.recoveryCodes);
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-sidebar-onyx px-5 py-10 text-white">
      <section className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white p-6 text-salon-ink shadow-2xl md:p-9">
        <BrandLogo className="mb-5 h-16 w-16" priority />
        <p className="text-xs font-black tracking-widest text-salon-gold">حماية إلزامية لحساب مدير المنصة</p>
        <h1 className="mt-2 text-3xl font-black">تفعيل المصادقة الثنائية</h1>
        {recoveryCodes ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900">تم التفعيل. احفظ رموز الاسترداد التالية في مدير كلمات مرور آمن؛ لن تُعرض مرة أخرى وكل رمز صالح مرة واحدة.</div>
            <div dir="ltr" className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-950 p-5 font-mono text-sm text-white">{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div>
            <button onClick={() => { window.location.href = "/platform"; }} className="dashboard-button-gold w-full py-3">حفظتها — دخول لوحة المنصة</button>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <p className="text-sm leading-7 text-slate-600">امسح الرمز بواسطة تطبيق مصادقة موثوق، ثم أدخل الرمز المكوّن من 6 أرقام. لن تُفتح لوحة المنصة قبل إكمال هذه الخطوة.</p>
            {setup ? <div className="mx-auto w-56 rounded-2xl border bg-white p-3" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
            {setup ? <div dir="ltr" className="break-all rounded-xl bg-slate-100 p-3 text-center font-mono text-sm">{setup.secret}</div> : null}
            <form onSubmit={confirm} className="space-y-3">
              <input name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" dir="ltr" placeholder="000000" className="dashboard-field text-center text-2xl tracking-[0.4em]" />
              {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
              <button disabled={loading || !setup} className="dashboard-button-gold w-full py-3">{loading ? "جاري التجهيز..." : "تحقق وفعّل الحماية"}</button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
