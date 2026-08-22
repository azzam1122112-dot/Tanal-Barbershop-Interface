"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { INSTALL_SNOOZE_KEY, isInstallSnoozed, nextInstallSnooze } from "@/lib/pwa/install-snooze";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallWindow = Window & { __xInstallPrompt?: InstallPromptEvent | null };

function isSnoozed() {
  return isInstallSnoozed(window.localStorage.getItem(INSTALL_SNOOZE_KEY));
}

function snooze() {
  window.localStorage.setItem(INSTALL_SNOOZE_KEY, nextInstallSnooze());
}

/**
 * طبقة التطبيق المثبّت لواجهة الحلاق: تسجيل عامل الخدمة، وعرض التحديث،
 * ودعوة التثبيت، ومؤشر انقطاع الشبكة.
 *
 * كلها أشرطة سفلية فوق منطقة الأمان — لا تحجب أزرار العمل الأساسية،
 * ولا تظهر أكثر من واحد في الوقت نفسه (الأولوية: انقطاع ← تحديث ← تثبيت).
 */
export function BarberPwa() {
  const pathname = usePathname();
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // ===== تسجيل عامل الخدمة =====
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    // في التطوير يتعارض عامل الخدمة مع إعادة التحميل الساخن — نسجّله في الإنتاج فقط.
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;

    navigator.serviceWorker
      .register("/barber-sw.js", { scope: "/barber" })
      .then((registration) => {
        if (cancelled) return;

        function trackInstalling(worker: ServiceWorker | null) {
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            // نسخة جديدة جاهزة وهناك نسخة تعمل بالفعل ⇒ تحديث ينتظر موافقة الحلاق.
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(worker);
            }
          });
        }

        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting);
        }
        trackInstalling(registration.installing);
        registration.addEventListener("updatefound", () => trackInstalling(registration.installing));
      })
      .catch(() => {
        // فشل التسجيل لا يمنع التطبيق من العمل — يبقى موقعًا عاديًا.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ===== دعوة التثبيت =====
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isSnoozed()) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // الحدث غالبًا وقع **قبل** هذا السطر والتقطه سكربت التخطيط المضمّن، فنقرؤه
    // من مخزنه أولًا. الاستماع بعده يغطّي حالتين: أن يتأخّر الحدث، أو ألا يعمل
    // السكربت المضمّن أصلًا.
    function adopt(event: InstallPromptEvent | null | undefined) {
      if (event) setInstallEvent(event);
    }

    adopt((window as InstallWindow).__xInstallPrompt);

    function onStashed() {
      adopt((window as InstallWindow).__xInstallPrompt);
    }

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    }

    // التثبيت لا يُسكت الدعوة بطابع زمني: المتصفح يتوقف عن إطلاق الحدث للتطبيق
    // المثبَّت، وفحص `standalone` أعلاه يغطّي الباقي. تسجيلُ إسكاتٍ هنا كان يعني
    // ألا تعود الدعوة أبدًا لمن أزال التطبيق ثم أراده مجددًا.
    function onInstalled() {
      setInstallEvent(null);
      setShowIosHint(false);
    }

    window.addEventListener("x:installprompt", onStashed);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS لا يدعم `beforeinstallprompt`؛ التثبيت فيه يدوي عبر قائمة المشاركة.
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !/Windows/.test(ua);
    if (isIos) setShowIosHint(true);

    return () => {
      window.removeEventListener("x:installprompt", onStashed);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // ===== حالة الشبكة =====
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const dismiss = useCallback(() => {
    snooze();
    setInstallEvent(null);
    setShowIosHint(false);
  }, []);

  const install = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    // الحدث يُستهلك بنداء واحد ولا يصلح لثانٍ — نُفرغ المخزن معه حتى لا يعرض
    // شريطٌ لاحق زرًّا ينادي حدثًا ميتًا.
    (window as InstallWindow).__xInstallPrompt = null;
    setInstallEvent(null);
    // رفضُ نافذة المتصفح ليس رفضًا للفكرة: نؤجّل الدعوة بدل تكرارها فورًا.
    if (choice.outcome === "dismissed") snooze();
  }, [installEvent]);

  const applyUpdate = useCallback(() => {
    waitingWorker?.postMessage("SKIP_WAITING");
    setWaitingWorker(null);
    window.location.reload();
  }, [waitingWorker]);

  if (isOffline) {
    return (
      <PwaBar tone="warning" icon="close">
        <p className="text-sm font-bold">لا يوجد اتصال بالإنترنت</p>
        <p className="mt-0.5 text-xs font-medium opacity-80">لن تُسجَّل أي عملية حتى تعود الشبكة.</p>
      </PwaBar>
    );
  }

  if (waitingWorker) {
    return (
      <PwaBar
        tone="gold"
        icon="check"
        action={{ label: "تحديث", onClick: applyUpdate }}
      >
        <p className="text-sm font-bold">تتوفّر نسخة جديدة</p>
        <p className="mt-0.5 text-xs font-medium opacity-80">أعد التحميل لتطبيق آخر التحسينات.</p>
      </PwaBar>
    );
  }

  // دعوة التثبيت التلقائية مناسبة في شاشة الدخول فقط. داخل شاشة العمل توجد
  // بطاقة دائمة في تبويب «يومي»، وعرض الشريط فوق نموذج الزيارة أو الصندوق
  // يحجب أزرار التحصيل ويكرّر الدعوة داخل التبويب نفسه.
  const canOfferInstall = pathname === "/barber/login";

  if (canOfferInstall && installEvent) {
    return (
      <PwaBar tone="onyx" icon="scissors" action={{ label: "تثبيت", onClick: install }} onDismiss={dismiss}>
        <p className="text-sm font-bold">ثبّت إكس مانس إكس XMANSX كتطبيق</p>
        <p className="mt-0.5 text-xs font-medium opacity-80">فتح أسرع من الشاشة الرئيسية، بلا شريط متصفح.</p>
      </PwaBar>
    );
  }

  if (canOfferInstall && showIosHint) {
    return (
      <PwaBar tone="onyx" icon="scissors" onDismiss={dismiss}>
        <p className="text-sm font-bold">ثبّت إكس مانس إكس XMANSX كتطبيق</p>
        <p className="mt-0.5 text-xs font-medium opacity-80">
          من شريط سفاري: <span className="font-bold">مشاركة</span> ← <span className="font-bold">إضافة إلى الشاشة الرئيسية</span>.
        </p>
      </PwaBar>
    );
  }

  return null;
}

function PwaBar({
  tone,
  icon,
  children,
  action,
  onDismiss,
}: {
  tone: "onyx" | "gold" | "warning";
  icon: "check" | "close" | "scissors";
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}) {
  const toneClass = {
    onyx: "border-white/10 bg-sidebar-onyx text-white",
    gold: "border-salon-gold/40 bg-sidebar-onyx text-white",
    warning: "border-amber-300 bg-amber-50 text-amber-950",
  }[tone];

  const actionClass = {
    onyx: "bg-gold-sheen text-white",
    gold: "bg-gold-sheen text-white",
    warning: "bg-amber-900 text-white",
  }[tone];

  return (
    <div role="status" className="barber-pwa-bar">
      <div
        className={`mx-auto flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] ${toneClass}`}
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10" aria-hidden="true">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">{children}</div>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold transition active:scale-[0.98] ${actionClass}`}
          >
            {action.label}
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="إخفاء"
            className="grid h-11 w-9 shrink-0 place-items-center rounded-xl text-current opacity-60 transition hover:opacity-100"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
