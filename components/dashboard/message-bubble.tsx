import { Fragment } from "react";

/** للتقسيم فقط (يحتاج `g`). */
const VARIABLE_SPLIT = /(\{[a-z_]+\})/g;
/**
 * للفحص. منفصل عمدًا بلا `g`: التعبير العام يحتفظ بـ `lastIndex` بين الاستدعاءات،
 * فتتناوب نتيجة `test` بين true وfalse على النص نفسه.
 */
const VARIABLE_TEST = /^\{[a-z_]+\}$/;

/**
 * معاينة الرسالة كفقاعة محادثة.
 *
 * كانت تُعرض داخل `<pre>`، والمتصفح يرسمه بخط أحادي المسافة — وهو يكسر
 * تشكيل الحروف العربية ويباعد بينها فتبدو الرسالة مشوّهة. هنا نستخدم خط
 * الواجهة نفسه مع `whitespace-pre-wrap` للحفاظ على الأسطر، ونعطي الفقاعة
 * شكل رسالة واتساب حتى يرى المدير ما سيصل العميل تمامًا.
 */
export function MessageBubble({
  body,
  tone = "outgoing",
  className = "",
}: {
  body: string;
  /** `outgoing` رسالة الصالون (خضراء)، `neutral` قالب غير مفعّل. */
  tone?: "outgoing" | "neutral";
  className?: string;
}) {
  const toneClass =
    tone === "outgoing"
      ? "bg-[#e7f6ec] text-salon-ink ring-[#bfe3cd]"
      : "bg-salon-mist text-salon-charcoal ring-salon-line";

  return (
    <div className={`relative ${className}`}>
      <div
        className={`whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm px-4 py-3 text-[13.5px] font-medium leading-[1.9] ring-1 ring-inset ${toneClass}`}
      >
        {highlightVariables(body)}
      </div>
      {/* ذيل الفقاعة ناحية اليمين — الرسالة صادرة من الصالون في تخطيط RTL. */}
      <span
        aria-hidden="true"
        className={`absolute -top-px right-0 h-3 w-3 ${tone === "outgoing" ? "bg-[#e7f6ec]" : "bg-salon-mist"}`}
        style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}
      />
    </div>
  );
}

function highlightVariables(body: string) {
  return body.split(VARIABLE_SPLIT).map((part, index) =>
    VARIABLE_TEST.test(part) ? (
      <span
        key={index}
        dir="ltr"
        className="mx-0.5 inline-block rounded-md bg-salon-gold/20 px-1.5 py-px align-middle text-[11px] font-bold text-[#7a5c2e]"
      >
        {part}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}
