/**
 * `fetch` لا يرمي — يعيد ردًّا فاشلًا مقروءًا بدل أن يرفض الوعد.
 *
 * **العطل الذي يعالجه:** كل معالجات الطفرات في الواجهة مكتوبة على النمط نفسه:
 *
 * ```ts
 * setLoading(true);
 * const response = await fetch(url, { method: "POST", ... });
 * const data = await response.json().catch(() => ({}));
 * if (response.ok) { ... } else { setMessage(data.message ?? "تعذر ..."); }
 * setLoading(false);
 * ```
 *
 * وحين تنقطع الشبكة — وهو الحال الطبيعي لحلاق في محل بإشارة ضعيفة، أو لعميل
 * على بيانات الجوال — **يرفض `fetch` الوعد** فيقفز التنفيذ فوق كل ما تحته:
 * لا رسالة، ولا `setLoading(false)`. الزر يبقى «جاري الحفظ...» إلى أن يُغلق
 * التطبيق، والمستخدم لا يعلم أشيءٌ حُفظ أم لا. صمتٌ تام في ٣٧ ملفًا.
 *
 * **ولماذا رَدٌّ لا استثناء:** التصحيح البديل كان لفّ كل معالج بـ `try/catch`
 * وكتابة رسالة في كل موضع — ثمانون تعديلًا يدويًا، وكل معالج جديد يُكتب لاحقًا
 * يعيد الثغرة صامتة. إعادةُ `Response` حقيقي بحالة 503 ورسالة عربية تجعل
 * الفرعَ الموجود أصلًا (`else`) يعرضها، فيعمل كل ما هو مكتوب بلا تغيير في
 * منطقه: `response.ok` تصير `false`، و`data.message` تحمل السبب، وما بعد
 * الاستدعاء يُنفَّذ فيُطفأ التحميل.
 *
 * تُستعمل في مكوّنات العميل وحدها. أما الخادم فانقطاعه هناك خطأ يُسجَّل عبر
 * `logger` ويُعاد 500 من `toErrorResponse` — لا يُخفى خلف ردّ مصطنع.
 */

/** 503 لا 0: `Response` لا يقبل الحالة صفرًا، و503 «الخدمة غير متاحة» أدقّ ما يصف انقطاعًا. */
const OFFLINE_STATUS = 503;

/** ترويسة تميّز الردّ المصطنع عن 503 قادم فعلًا من الخادم، لمن يحتاج التفريق. */
export const OFFLINE_HEADER = "x-offline-response";

export const OFFLINE_MESSAGE = "انقطع الاتصال بالخادم — تحقق من الشبكة وأعد المحاولة";
export const DEVICE_OFFLINE_MESSAGE = "لا يوجد اتصال بالإنترنت — لم تُرسل العملية، أعد المحاولة عند عودة الشبكة";

function offlineResponse() {
  // `navigator.onLine` يفرّق «جهازك بلا شبكة» عن «الخادم لا يستجيب»، وهما
  // إجراءان مختلفان عند المستخدم: الأول ينتظر الشبكة والثاني يبلّغ الإدارة.
  const deviceOffline = typeof navigator !== "undefined" && navigator.onLine === false;

  return new Response(JSON.stringify({ message: deviceOffline ? DEVICE_OFFLINE_MESSAGE : OFFLINE_MESSAGE }), {
    status: OFFLINE_STATUS,
    headers: { "Content-Type": "application/json", [OFFLINE_HEADER]: "1" },
  });
}

/** الإلغاء ليس عطلًا: طلبٌ ألغاه المكوّن عند تفكيكه أو عند تغيير الاختيار. */
function isAbort(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError")
  );
}

export async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    // الإلغاء يُعاد رميه كما هو: `ShareReceiptPdfButton` و`RescheduleDialog`
    // يلغيان طلبهما عند التفكيك ويفحصان `AbortError` ليصمتا. ابتلاعه هنا
    // وإعادة 503 يقلب الإلغاء المقصود إلى رسالة «انقطع الاتصال» على شاشة
    // تُغادر أصلًا — إشعارٌ عن عطل لم يقع.
    if (isAbort(error)) throw error;
    return offlineResponse();
  }
}

/** هل هذا الردّ مصطنعٌ من انقطاع الشبكة لا من الخادم؟ */
export function isOfflineResponse(response: Response) {
  return response.status === OFFLINE_STATUS && response.headers.get(OFFLINE_HEADER) === "1";
}
