"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";

type PushConfig = {
  enabled: boolean;
  publicKey: string | null;
  subscribed: boolean;
};

type PushState =
  | "loading"
  | "unsupported"
  | "install-ios"
  | "development"
  | "unconfigured"
  | "denied"
  | "inactive"
  | "active"
  | "error";

/**
 * شريط تنبيهات المواعيد.
 *
 * **صفٌّ واحد لا بطاقة:** التفعيل مهمة تُنفَّذ **مرة واحدة في عمر الجهاز**،
 * وكانت تحتلّ بطاقة بعنوان ووصف وشارة حالة فوق زر البيع مباشرة. الشرح الطويل
 * انتقل إلى `detail` ولا يُعرض إلا حين تكون هناك خطوة على الحلاق أن يفعلها؛
 * وبعد التفعيل يبقى سطر أخضر واحد فيه التجربة والإيقاف خلف زر «خيارات».
 */
const COPY: Record<PushState, { label: string; title: string; detail: string }> = {
  loading: {
    label: "جاري الفحص",
    title: "نجهّز قناة التنبيهات",
    detail: "نتأكد من جاهزية هذا الجهاز لاستقبال مواعيدك.",
  },
  unsupported: {
    label: "غير مدعوم",
    title: "المتصفح لا يدعم التنبيهات",
    detail: "افتح إكس مانس إكس XMANSX بآخر إصدار من Chrome أو Safari.",
  },
  "install-ios": {
    label: "خطوة واحدة",
    title: "ثبّت التطبيق لتصلك المواعيد",
    detail: "على iPhone: مشاركة ← إضافة إلى الشاشة الرئيسية، ثم افتح التطبيق من الأيقونة.",
  },
  development: {
    label: "جاهز للنشر",
    title: "التنبيهات مهيأة بالكامل",
    detail: "تظهر خاصية التفعيل عند تشغيل نسخة الإنتاج الآمنة عبر HTTPS.",
  },
  unconfigured: {
    label: "قيد التجهيز",
    title: "الخدمة تحتاج مفاتيح التشغيل",
    detail: "سيظهر زر التفعيل فور إكمال إعداد Web Push على الخادم.",
  },
  denied: {
    label: "محظور",
    title: "التنبيهات موقوفة من الجهاز",
    detail: "اسمح بالتنبيهات لتطبيق إكس مانس إكس XMANSX من إعدادات المتصفح أو الهاتف.",
  },
  inactive: {
    label: "غير مفعّلة",
    title: "موعد جديد؟ ستعرف فورًا",
    detail: "فعّلها مرة واحدة لتصل حجوزاتك حتى عندما يكون التطبيق مغلقًا.",
  },
  active: {
    label: "مباشر الآن",
    title: "تنبيهات المواعيد تعمل",
    detail: "هذا الجهاز متصل وسيستقبل كل حجز جديد يُسند إليك.",
  },
  error: {
    label: "تعذر الاتصال",
    title: "لم يكتمل تفعيل التنبيهات",
    detail: "تحقق من الإنترنت ثم حاول مرة أخرى.",
  },
};

export function BarberNotificationCenter() {
  const [state, setState] = useState<PushState>("loading");
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const inspect = useCallback(async () => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isIos = /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !/Windows/.test(window.navigator.userAgent);
    if (isIos && !standalone) {
      setState("install-ios");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      setState("development");
      return;
    }

    try {
      const response = await fetch("/api/barber/push", { cache: "no-store" });
      if (!response.ok) throw new Error("push config unavailable");
      const nextConfig = (await response.json()) as PushConfig;
      setConfig(nextConfig);

      if (!nextConfig.enabled || !nextConfig.publicKey) {
        setState("unconfigured");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration("/barber");
      const localSubscription = await registration?.pushManager.getSubscription();
      setState(nextConfig.subscribed && Boolean(localSubscription) ? "active" : "inactive");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void inspect();
  }, [inspect]);

  async function enable() {
    if (!config?.publicKey || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const permission = await withTimeout(
        Notification.requestPermission(),
        30_000,
        "انتهت مهلة إذن التنبيهات — حاول مجددًا",
      );
      if (permission !== "granted") {
        setState("denied");
        return;
      }

      const registration =
        (await navigator.serviceWorker.getRegistration("/barber")) ??
        (await navigator.serviceWorker.register("/barber-sw.js", { scope: "/barber" }));
      await waitForActiveWorker(registration);

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        }));

      const response = await fetch("/api/barber/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        if (!existing) await subscription.unsubscribe().catch(() => false);
        throw new Error(data.message || "تعذر تفعيل التنبيهات");
      }

      setState("active");
      setConfig((current) => (current ? { ...current, subscribed: true } : current));
      setFeedback("تم ربط هذا الجهاز بنجاح");
    } catch (error) {
      setState("error");
      setFeedback(error instanceof Error ? error.message : "تعذر تفعيل التنبيهات");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/barber");
      const subscription = await registration?.pushManager.getSubscription();
      const response = await fetch("/api/barber/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription?.endpoint }),
      });
      if (!response.ok) throw new Error("تعذر إيقاف التنبيهات");
      await subscription?.unsubscribe();
      setState("inactive");
      setConfig((current) => (current ? { ...current, subscribed: false } : current));
      setFeedback("تم إيقاف التنبيهات على هذا الجهاز");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "تعذر إيقاف التنبيهات");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/barber/push/test", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message || "تعذر إرسال التجربة");
      setFeedback("أرسلنا تنبيهًا تجريبيًا إلى جهازك");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "تعذر إرسال التجربة");
    } finally {
      setBusy(false);
    }
  }

  const copy = COPY[state];
  const isActive = state === "active";
  const canEnable = state === "inactive" || state === "error";
  // الشرح يظهر فقط حين تبقى خطوة على الحلاق. بعد التفعيل السطر يكفي.
  const showDetail = !isActive && state !== "loading";

  return (
    <section className="barber-card p-3" aria-labelledby="push-title">
      <div className="flex items-center gap-3">
        <span className="barber-notification-icon" aria-hidden="true">
          <Icon name="bell" className="h-4 w-4" />
          {isActive ? <span className="barber-notification-pulse" /> : null}
        </span>

        <div className="min-w-0 flex-1">
          <h2 id="push-title" className="truncate text-sm font-bold text-salon-ink">
            {copy.title}
          </h2>
          <span className={`push-status-chip push-status-${state} mt-1`}>
            <span aria-hidden="true" />
            {copy.label}
          </span>
        </div>

        {canEnable ? (
          <button type="button" onClick={enable} disabled={busy} className="barber-gold-button min-h-11 shrink-0 text-sm">
            {busy ? "جاري التفعيل..." : "فعّل"}
          </button>
        ) : null}

        {state === "denied" ? (
          <button
            type="button"
            onClick={() => void inspect()}
            className="barber-ghost-button min-h-11 shrink-0 text-sm"
          >
            تحقق مجددًا
          </button>
        ) : null}

        {isActive ? (
          <button
            type="button"
            onClick={() => setOptionsOpen((current) => !current)}
            aria-expanded={optionsOpen}
            className="barber-ghost-button min-h-11 shrink-0 px-3 text-xs"
          >
            {optionsOpen ? "إخفاء" : "خيارات"}
          </button>
        ) : null}
      </div>

      {state === "loading" ? <div className="mt-2 h-3 animate-pulse rounded-full bg-salon-line/40" /> : null}

      {showDetail ? (
        <p className="mt-2 text-xs font-semibold leading-5 text-salon-charcoal/70">{copy.detail}</p>
      ) : null}

      {isActive && optionsOpen ? (
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <button type="button" onClick={sendTest} disabled={busy} className="barber-primary-button min-h-11 text-sm">
            <Icon name="check" className="h-4 w-4" />
            {busy ? "جاري الإرسال..." : "جرّب التنبيه"}
          </button>
          <button type="button" onClick={disable} disabled={busy} className="barber-ghost-button min-h-11 px-3 text-xs">
            إيقاف
          </button>
        </div>
      ) : null}

      {feedback ? (
        <p className="mt-2 text-xs font-bold text-salon-forest" role="status" aria-live="polite">
          {feedback}
        </p>
      ) : null}
    </section>
  );
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function waitForActiveWorker(registration: ServiceWorkerRegistration) {
  if (registration.active) return;
  const worker = registration.installing ?? registration.waiting;
  if (!worker) throw new Error("تعذر تشغيل خدمة التنبيهات — أعد تحميل الصفحة وحاول مجددًا");

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error("استغرق تشغيل خدمة التنبيهات وقتًا طويلًا — أعد المحاولة")),
      15_000,
    );

    function finish(error?: Error) {
      clearTimeout(timeout);
      worker?.removeEventListener("statechange", onStateChange);
      if (error) reject(error);
      else resolve();
    }

    function onStateChange() {
      if (worker?.state === "activated" || registration.active) {
        finish();
      } else if (worker?.state === "redundant") {
        finish(new Error("تعذر تشغيل خدمة التنبيهات — أعد تحميل الصفحة وحاول مجددًا"));
      }
    }

    worker.addEventListener("statechange", onStateChange);
    onStateChange();
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
