"use client";

import { useEffect, useState } from "react";

/**
 * تثبيت البوابة على جهاز العميل.
 *
 * **لماذا هذا هو الحل لا استرجاع الرابط**: قرار الخصوصية في `/join` يمنع إعادة
 * الرابط لرقم مسجّل — وإلا لأمكن لأي شخص تعداد عملاء الصالون بإدخال أرقام.
 * فالوصول المستقبلي يُحفظ على جهاز العميل نفسه، لا يُسترجع من الخادم.
 */

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PortalInstall() {
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // التطبيق مثبَّت أصلًا — لا نعرض دعوة تكرّر ما فُعل.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    function onPrompt(event: Event) {
      event.preventDefault();
      setDeferred(event as InstallPrompt);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) {
      setShowHelp(true);
      return;
    }
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setShowHelp(true);
    }
  }

  if (installed) return null;

  return (
    <section className="rounded-2xl border border-salon-gold/35 bg-salon-gold/[0.08] px-5 py-5">
      <h2 className="text-base font-bold">احفظ صفحتك للوصول السريع</h2>
      <p className="mt-1.5 text-sm font-semibold leading-6 text-salon-charcoal">
        هذا الرابط هو مفتاح صفحتك ولا يُرسل مرة أخرى. ثبّته على شاشة هاتفك لتفتحه بلمسة في أي وقت.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={install}
          className="rounded-2xl bg-salon-ink py-3 text-sm font-black text-white"
        >
          إضافة للشاشة
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="rounded-2xl border border-salon-line bg-white py-3 text-sm font-black text-salon-charcoal"
        >
          {copied ? "تم النسخ ✓" : "نسخ الرابط"}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{copied ? "تم نسخ رابط الصفحة" : ""}</span>

      {showHelp ? (
        <div className="mt-4 space-y-3 rounded-2xl bg-white px-4 py-4 text-xs font-semibold leading-6 text-salon-charcoal">
          <p>
            <span className="font-black">آيفون (Safari):</span> اضغط زر المشاركة{" "}
            <span aria-hidden="true">􀈂</span> ثم «إضافة إلى الشاشة الرئيسية».
          </p>
          <p>
            <span className="font-black">أندرويد (Chrome):</span> اضغط قائمة النقاط الثلاث ⋮ ثم «إضافة إلى الشاشة
            الرئيسية».
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="mt-3 w-full text-center text-xs font-bold text-salon-charcoal/70 underline"
        >
          كيف أضيفها يدويًا؟
        </button>
      )}
    </section>
  );
}
