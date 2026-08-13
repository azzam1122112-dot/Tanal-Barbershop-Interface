"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallWindow = Window & { __xInstallPrompt?: InstallPromptEvent | null };

/**
 * مدخل تثبيت دائم في تبويب «يومي».
 *
 * **الشريط التلقائي وحده لا يكفي:** المتصفح يُطلق `beforeinstallprompt` مرة
 * واحدة ووفق شروطه هو — ولا يُطلقه إطلاقًا على iOS، ولا بعد أن يرفض المستخدم
 * نافذة التثبيت مرة، ولا في متصفح لا يدعم التثبيت. فيبقى الحلاق الذي **يريد**
 * التطبيق بلا أي طريق إليه، وهو ما حدث فعلًا.
 *
 * هذه البطاقة لا تعترض العمل: تعيش في تبويب لا يُفتح أثناء الخدمة، وتختفي
 * كليًا متى كان التطبيق مثبّتًا — فلا تدعو إلى ما تمّ.
 */
export function BarberInstallCard() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    const ua = window.navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !/Windows/.test(ua));

    // المخزن يملؤه سكربت `app/barber/layout.tsx` قبل ترطيب React.
    setPrompt((window as InstallWindow).__xInstallPrompt ?? null);

    function onStashed() {
      setPrompt((window as InstallWindow).__xInstallPrompt ?? null);
    }
    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setPrompt(null);
    }

    window.addEventListener("x:installprompt", onStashed);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("x:installprompt", onStashed);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) {
      setShowSteps(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    (window as InstallWindow).__xInstallPrompt = null;
    setPrompt(null);
    if (choice.outcome === "accepted") setDone(true);
    else setShowSteps(true);
  }, [prompt]);

  if (installed) return null;

  return (
    <section className="barber-card p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-salon-ink text-white"
        >
          <Icon name="scissors" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-salon-ink">ثبّت التطبيق على جوالك</h2>
          <p className="mt-0.5 text-xs font-semibold leading-5 text-salon-charcoal/70">
            يفتح من الشاشة الرئيسية بلا شريط متصفح، وأسرع في بداية الدوام.
          </p>
        </div>
        {/* على iOS لا يوجد تثبيت برمجي — الزر يعرض الخطوات مباشرة. */}
        {isIos ? null : (
          <button type="button" onClick={install} className="barber-gold-button min-h-11 shrink-0 text-sm">
            تثبيت
          </button>
        )}
      </div>

      {done ? (
        <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">
          تم التثبيت — افتح التطبيق من أيقونته على الشاشة الرئيسية.
        </p>
      ) : null}

      {isIos || showSteps ? (
        <div className="mt-3 space-y-2 rounded-xl border border-salon-line bg-salon-pearl px-3.5 py-3 text-xs font-semibold leading-6 text-salon-charcoal">
          <p>
            <span className="font-black text-salon-ink">آيفون (Safari):</span> زر المشاركة ← «إضافة إلى الشاشة
            الرئيسية».
          </p>
          <p>
            <span className="font-black text-salon-ink">أندرويد (Chrome):</span> قائمة النقاط الثلاث ⋮ ← «تثبيت
            التطبيق» أو «إضافة إلى الشاشة الرئيسية».
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowSteps(true)}
          className="mt-2 w-full text-center text-xs font-bold text-salon-charcoal/70 underline"
        >
          كيف أثبّته يدويًا؟
        </button>
      )}
    </section>
  );
}
