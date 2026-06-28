"use client";

import { FormEvent, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function BarberLoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [showOrg, setShowOrg] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isIosInstall, setIsIosInstall] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    const isMobile = window.matchMedia("(max-width: 768px)").matches || /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
    const dismissedAt = Number(window.sessionStorage.getItem("barber-install-dismissed-at") ?? 0);
    const wasDismissedRecently = dismissedAt > 0 && Date.now() - dismissedAt < 1000 * 60 * 60 * 6;

    if (isStandalone || !isMobile || wasDismissedRecently) return;

    const ios = /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
    setIsIosInstall(ios);

    const timer = window.setTimeout(() => setShowInstallPrompt(true), 900);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setShowInstallPrompt(true);
    }

    function handleAppInstalled() {
      setShowInstallPrompt(false);
      setInstallPrompt(null);
      window.sessionStorage.setItem("barber-install-dismissed-at", String(Date.now()));
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("org");
    if (fromUrl) {
      setOrgSlug(fromUrl.toLowerCase());
      setShowOrg(true);
    }
  }, []);

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
        organizationSlug: form.get("organizationSlug") || undefined,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      redirectTo?: string;
      needsOrganization?: boolean;
    };

    if (!response.ok) {
      if (data.needsOrganization) setShowOrg(true);
      setError(data.message ?? "رقم الجوال أو رمز الدخول غير صحيح");
      setLoading(false);
      return;
    }

    window.location.href = data.redirectTo ?? "/barber";
  }

  function closeInstallPrompt() {
    window.sessionStorage.setItem("barber-install-dismissed-at", String(Date.now()));
    setShowInstallPrompt(false);
  }

  async function installApp() {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setShowInstallPrompt(false);
    }
    setInstallPrompt(null);
  }

  return (
    <main className="barber-shell px-4 py-5">
      {showInstallPrompt ? (
        <div className="fixed inset-0 z-50 flex items-end bg-salon-ink/55 px-4 py-5 backdrop-blur-sm sm:items-center sm:justify-center">
          <section className="w-full rounded-lg border border-white/80 bg-white p-5 shadow-[0_26px_70px_rgba(16,25,22,0.22)] sm:max-w-sm" role="dialog" aria-modal="true" aria-labelledby="install-title">
            <div className="flex items-start gap-3">
              <BrandLogo className="h-12 w-12 border border-salon-line shadow-sm" priority />
              <div>
                <p className="text-xs font-black text-salon-gold">تطبيق الحلاق</p>
                <h2 id="install-title" className="mt-1 text-2xl font-black leading-tight">ثبت تنال على الجوال</h2>
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold leading-7 text-salon-charcoal">
              افتح لوحة الحلاق بسرعة من الشاشة الرئيسية بدون البحث عن الرابط كل مرة.
            </p>
            {!installPrompt ? (
              <div className="mt-4 rounded-lg border border-salon-line bg-salon-pearl p-3 text-sm font-bold leading-7 text-salon-charcoal">
                {isIosInstall ? "في iPhone اضغط مشاركة، ثم اختر إضافة إلى الشاشة الرئيسية." : "من قائمة المتصفح اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية."}
              </div>
            ) : null}
            <div className="mt-5 grid gap-2">
              {installPrompt ? (
                <button type="button" onClick={() => void installApp()} className="barber-primary-button h-12 w-full">
                  تثبيت الآن
                </button>
              ) : null}
              <button type="button" onClick={closeInstallPrompt} className="barber-ghost-button h-12 w-full">
                لاحقًا
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <section className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-sm min-w-0 flex-col justify-center">
        <div className="sheen-overlay overflow-hidden rounded-2xl border border-salon-ink/10 bg-white shadow-[0_30px_70px_-30px_rgba(16,25,22,0.45)]">
          <div className="relative overflow-hidden bg-sidebar-onyx px-5 py-6 text-white">
            <span className="absolute inset-x-0 top-0 h-1 bg-royal-gold" aria-hidden="true" />
            <span className="animate-glow pointer-events-none absolute -top-16 left-[-10%] h-44 w-44 rounded-full bg-salon-gold/25 blur-2xl" aria-hidden="true" />
            <span className="animate-glow pointer-events-none absolute -bottom-20 right-[-10%] h-40 w-40 rounded-full bg-salon-forest/30 blur-2xl" style={{ animationDelay: "1.5s" }} aria-hidden="true" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <BrandLogo className="animate-float h-12 w-12 ring-1 ring-salon-gold/30" priority />
                <span className="text-[11px] font-bold uppercase tracking-eyebrow text-salon-goldlight">واجهة تنال</span>
              </div>
              <span className="h-2 w-2 rounded-full bg-salon-gold shadow-[0_0_12px_2px_rgba(169,130,69,0.6)]" />
            </div>
            <h1 className="relative mt-10 text-3xl font-bold leading-tight tracking-tight">
              دخول <span className="text-gold-sheen">الحلاق</span>
            </h1>
          </div>
          <form onSubmit={submit} className="space-y-4 px-5 py-6">
            {showOrg ? (
              <label className="block text-sm font-bold">
                معرّف المؤسسة
                <input
                  name="organizationSlug"
                  value={orgSlug}
                  onChange={(event) => setOrgSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  dir="ltr"
                  required
                  autoFocus
                  autoComplete="organization"
                  placeholder="معرّف صالونك"
                  className="barber-field mt-2 h-12 text-center text-base"
                />
                <span className="mt-1 block text-center text-xs font-medium text-salon-charcoal/60">اطلبه من مدير صالونك إن لم تكن تعرفه.</span>
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
            {error ? <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="barber-gold-button sheen-overlay h-14 w-full text-lg"
            >
              {loading ? "جاري الدخول..." : "دخول"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
