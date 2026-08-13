/**
 * تأكيد يعبر إعادة تحميل الصفحة.
 *
 * **المشكلة التي يحلّها:** عدة شاشات كانت تكتب تأكيد النجاح ثم تعيد تحميل
 * الصفحة في السطر التالي — `setMessage("تم فتح جلسة الصندوق")` ثم
 * `window.location.reload()`. إعادة التحميل تمحو ذاكرة React كلها، فالتأكيد
 * يُكتب ويُمحى في الإطار نفسه ولا يراه أحد. النتيجة عمليًا: أهم عمليتين عند
 * الحلاق — فتح الجلسة وإنهاؤها — تتمّان **بلا أي تأكيد**، ولا يعرف أنها نجحت
 * إلا باستنتاجه من شكل الشاشة بعد التحميل.
 *
 * الحل: نودع الرسالة في `sessionStorage` قبل التحميل، ويلتقطها `NoticeRelay`
 * بعده فيعرضها إشعارًا. و`sessionStorage` لا `localStorage`: التأكيد يخصّ هذه
 * الجلسة وهذا التبويب، وبقاؤه بعد إغلاق المتصفح يعني إشعارًا عن عمل الأمس.
 */
export const HANDOFF_NOTICE_KEY = "x-handoff-notice";

export type HandoffTone = "success" | "error" | "info" | "warning";

export type HandoffNotice = { message: string; tone: HandoffTone };

/** يُقرأ مرة واحدة ثم يُمحى — إشعار يعود مع كل تحديث للصفحة يصير ضجيجًا. */
export function readHandoffNotice(raw: string | null): HandoffNotice | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HandoffNotice>;
    if (!parsed || typeof parsed.message !== "string" || parsed.message.trim() === "") return null;
    const tone: HandoffTone =
      parsed.tone === "error" || parsed.tone === "warning" || parsed.tone === "info" ? parsed.tone : "success";
    return { message: parsed.message, tone };
  } catch {
    return null;
  }
}

export function serializeHandoffNotice(message: string, tone: HandoffTone = "success") {
  return JSON.stringify({ message, tone } satisfies HandoffNotice);
}

/** استدعِها قبل `window.location.reload()` أو التنقّل الكامل مباشرة. */
export function handOffNotice(message: string, tone: HandoffTone = "success") {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(HANDOFF_NOTICE_KEY, serializeHandoffNotice(message, tone));
  } catch {
    // التخزين قد يكون ممنوعًا (تصفح خاص/حصة ممتلئة). التأكيد تحسين لا شرط
    // لنجاح العملية، فلا يصحّ أن يُفشل الإجراء الذي تمّ فعلًا.
  }
}

export function takeHandoffNotice(): HandoffNotice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_NOTICE_KEY);
    window.sessionStorage.removeItem(HANDOFF_NOTICE_KEY);
    return readHandoffNotice(raw);
  } catch {
    return null;
  }
}
