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

  function updatePhone(value: string) {
    setPhone(value.replace(/\D/g, "").slice(0, 12));
  }

  function normalizePhone(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith("9665")) return `0${digits.slice(3, 12)}`;
    if (digits.startsWith("5")) return `0${digits.slice(0, 9)}`;
    return digits.slice(0, 10);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const localPhone = normalizePhone(phone);

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
        <div className="overflow-hidden rounded-lg border border-salon-ink/10 bg-white shadow-[0_24px_58px_rgba(16,25,22,0.12)]">
          <div className="bg-salon-ink px-5 py-6 text-white">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <BrandLogo className="h-12 w-12 ring-1 ring-white/20" priority />
                <span className="text-sm font-black text-salon-gold">حلاق تنال</span>
              </div>
              <span className="h-2 w-2 rounded-full bg-salon-gold" />
            </div>
            <h1 className="mt-10 text-3xl font-black leading-tight">دخول الحلاق</h1>
          </div>
          <form onSubmit={submit} className="space-y-4 px-5 py-6">
            <label className="block text-sm font-bold">
              رقم الجوال
              <input
                name="phone"
                value={phone}
                onChange={(event) => updatePhone(event.target.value)}
                inputMode="numeric"
                required
                minLength={9}
                maxLength={12}
                autoComplete="tel"
                placeholder="05xxxxxxxx"
                className="barber-field mt-2 h-14 text-xl"
              />
            </label>
            <label className="block text-sm font-bold">
              رمز الدخول
              <input
                name="pin"
                inputMode="numeric"
                required
                minLength={4}
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="••••"
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
          </form>
        </div>
      </section>
    </main>
  );
}
