"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";

export type ToastTone = "success" | "error" | "info" | "warning";

export type ToastState = {
  message: string;
  tone?: ToastTone;
  /** عنوان يحلّ محل التسمية الافتراضية للنبرة. */
  title?: string;
};

/**
 * الإشعارات اللحظية — مصدر حقيقة واحد لكل الفضاءات (حلاق/لوحة/منصّة).
 *
 * **لماذا بوابة (portal) إلى `body` لا عنصر في مكانه:** البطاقة كانت تُرسم داخل
 * شجرة المكوّن الذي أطلقها عند `z-50`، والنوافذ المنزلقة في هذا المشروع عند
 * `z-[100]`. فكل إشعار يُطلق ونافذة مفتوحة — وهو أكثر ما يحدث: تأكيد، صرف
 * عمولة، حذف — كان يُرسم **خلف** طبقة النافذة فلا يراه أحد. الإطلاق نجح
 * والمستخدم لم يعلم. البوابة تُخرج البطاقة من كل سياق تكديس محلي إلى جذر واحد
 * فوق كل شيء.
 *
 * **ولماذا جذر مشترك لا بطاقة لكل نسخة:** `DashboardToast` مركّب في ٣١ موضعًا،
 * وفي جدول العملاء نسخةٌ لكل صف. كلها كانت `fixed` عند النقطة نفسها، فإشعاران
 * في وقت واحد يقف أحدهما فوق الآخر تمامًا. الجذر عمود `flex` فتتراصّ البطاقات.
 */
const TOAST_ROOT_ID = "x-toast-root";

/** الخطأ يحتاج وقت قراءة أطول من التأكيد: النجاح يُلمح، والخطأ يُقرأ ويُقرَّر بشأنه. */
const DISMISS_MS: Record<ToastTone, number> = {
  success: 4200,
  info: 4600,
  warning: 6500,
  error: 8000,
};

const APPEARANCE: Record<ToastTone, { card: string; icon: string; bar: string; label: string; glyph: "check" | "bell" | "close" }> = {
  success: {
    card: "border-emerald-300/40 bg-[#071b16] text-emerald-50",
    icon: "bg-emerald-400/15 text-emerald-300",
    bar: "bg-emerald-400/70",
    label: "تم بنجاح",
    glyph: "check",
  },
  error: {
    card: "border-rose-300/45 bg-[#211016] text-rose-50",
    icon: "bg-rose-400/15 text-rose-300",
    bar: "bg-rose-400/70",
    label: "لم تتم العملية",
    glyph: "close",
  },
  warning: {
    card: "border-amber-300/40 bg-[#211a0d] text-amber-50",
    icon: "bg-amber-400/15 text-amber-200",
    bar: "bg-amber-400/70",
    label: "يحتاج انتباه",
    glyph: "bell",
  },
  info: {
    card: "border-violet-300/40 bg-[#110c1d] text-violet-50",
    icon: "bg-violet-400/15 text-violet-300",
    bar: "bg-violet-400/70",
    label: "معلومة",
    glyph: "bell",
  },
};

function getToastRoot() {
  if (typeof document === "undefined") return null;
  let root = document.getElementById(TOAST_ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = TOAST_ROOT_ID;
    root.className = "x-toast-root";
    root.setAttribute("dir", "rtl");
    // **منطقة حيّة دائمة لا منطقة تُنشأ مع كل إشعار:** قارئ الشاشة يراقب
    // المناطق الحيّة الموجودة وقت التغيير. عنصرٌ يحمل `aria-live` ويُضاف
    // ومحتواه فيه لا يُعلَن غالبًا — كان التأكيد يظهر للمبصر ولا يصل لغيره.
    // الجذر يُنشأ مرة واحدة ويبقى، فكل بطاقة تُضاف إليه تُعلَن.
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    document.body.appendChild(root);
  }
  return root;
}

export function DashboardToast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [paused, setPaused] = useState(false);

  // الجذر يُنشأ بعد الترطيب فقط: `document` غير موجود أثناء التصيير على الخادم.
  useEffect(() => {
    setRoot(getToastRoot());
  }, []);

  const tone = toast?.tone ?? "info";

  useEffect(() => {
    if (!toast || paused) return;
    const timer = window.setTimeout(onClose, DISMISS_MS[tone]);
    return () => window.clearTimeout(timer);
  }, [toast, tone, paused, onClose]);

  if (!toast || !root) return null;

  const appearance = APPEARANCE[tone];

  return createPortal(
    <div
      // بلا `role`/`aria-live` هنا: الجذر هو المنطقة الحيّة، وتعشيش منطقتين
      // يجعل قارئ الشاشة ينطق الرسالة مرتين.
      // الوقوف بالمؤشر أو بالتركيز يوقف العدّ: رسالة خطأ فيها مبلغ أو سبب رفض
      // تحتاج قراءة، والاختفاء تحتها يُفقد المستخدم ما لا يستطيع استرجاعه.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className={`x-toast pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border shadow-[0_24px_65px_-26px_rgba(15,23,42,.85)] backdrop-blur-xl ${appearance.card}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      <div className="flex items-start gap-3 p-4">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${appearance.icon}`} aria-hidden="true">
          <Icon name={appearance.glyph} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black">{toast.title ?? appearance.label}</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-white/80">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق الإشعار"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      {/* شريط زمن يُظهر أن الإشعار سيختفي — الاختفاء المفاجئ بلا تمهيد يُقرأ كعطل. */}
      <div
        aria-hidden="true"
        className={`x-toast-progress h-1 origin-right ${appearance.bar}`}
        style={{ animationDuration: `${DISMISS_MS[tone]}ms`, animationPlayState: paused ? "paused" : "running" }}
      />
    </div>,
    root,
  );
}

/**
 * اختصار لمن لا يحتاج إدارة الحالة بنفسه.
 * الاستخدام: `const { showToast, toastNode } = useToast();` ثم ارسم `{toastNode}`.
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((message: string, tone: ToastTone = "info", title?: string) => {
    setToast({ message, tone, title });
  }, []);

  const toastNode = <DashboardToast toast={toast} onClose={closeToast} />;
  return { toast, showToast, closeToast, toastNode };
}

/**
 * ملاحظة داخل السياق — بديل السطر الرمادي الذي كان يعرض النجاح والفشل بلون واحد.
 *
 * **لماذا نبرة إلزامية:** كانت الشاشات تحفظ نصًّا واحدًا في `message` وتعرضه
 * بصنف ثابت: «تعذر تسجيل المصروف» في صندوق أخضر، و«تعذر تسجيل الحضور» بخط
 * أخضر. الفشل كان يُقرأ نجاحًا حرفيًا. النبرة هنا جزء من النوع فلا يُنسى تمريرها.
 *
 * **ولماذا أيقونة مع اللون:** القاعدة نفسها المطبَّقة على `Badge` — من لا يميّز
 * الأحمر من الأخضر يحتاج شكلًا لا لونًا.
 */
export type FeedbackTone = ToastTone;

export type FeedbackState = { message: string; tone: FeedbackTone } | null;

const NOTE_APPEARANCE: Record<FeedbackTone, { box: string; badge: string; glyph: "check" | "bell" | "close"; label: string }> = {
  success: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-900",
    badge: "bg-emerald-100 text-emerald-700",
    glyph: "check",
    label: "تم",
  },
  error: {
    box: "border-red-200 bg-red-50 text-red-900",
    badge: "bg-red-100 text-red-700",
    glyph: "close",
    label: "لم تتم العملية",
  },
  warning: {
    box: "border-amber-200 bg-amber-50 text-amber-900",
    badge: "bg-amber-100 text-amber-800",
    glyph: "bell",
    label: "انتبه",
  },
  info: {
    box: "border-salon-line bg-salon-mist text-salon-ink",
    badge: "bg-white text-salon-charcoal",
    glyph: "bell",
    label: "معلومة",
  },
};

export function FeedbackNote({
  feedback,
  className = "",
}: {
  feedback: FeedbackState;
  className?: string;
}) {
  if (!feedback) return null;
  const appearance = NOTE_APPEARANCE[feedback.tone];

  return (
    <p
      role={feedback.tone === "error" ? "alert" : "status"}
      aria-live={feedback.tone === "error" ? "assertive" : "polite"}
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-semibold leading-6 ${appearance.box} ${className}`}
    >
      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ${appearance.badge}`} aria-hidden="true">
        <Icon name={appearance.glyph} className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="sr-only">{appearance.label}: </span>
        {feedback.message}
      </span>
    </p>
  );
}

/** إدارة حالة الملاحظة مع مساعدَي نبرة، حتى لا يُكتب الكائن يدويًا في كل موضع. */
export function useFeedback() {
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const succeed = useCallback((message: string) => setFeedback({ message, tone: "success" }), []);
  const fail = useCallback((message: string) => setFeedback({ message, tone: "error" }), []);
  const clear = useCallback(() => setFeedback(null), []);
  return { feedback, setFeedback, succeed, fail, clear };
}

/**
 * إعلان لقارئ الشاشة بلا أثر بصري — لِما يُرى تغيّره ولا يُقرأ.
 * مثال: عدد نتائج البحث، أو تغيّر الرصيد بعد إجراء.
 */
