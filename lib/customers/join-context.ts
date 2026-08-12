import crypto from "crypto";
import { BusinessError } from "@/lib/errors";

/**
 * سياق الانضمام: أي مؤسسة يريد العميل الانضمام إليها، محمولًا عبر صفحات
 * المصادقة الموحّدة (تسجيل ← تفعيل ← دخول) حتى يكتمل الانضمام بعدها.
 *
 * **لماذا موقّع ولماذا slug:**
 * - **موقّع** لأن القيمة تعبر المتصفح. حقل مخفي غير محمي يعني أن من يعدّله يوجّه
 *   انضمامه إلى مؤسسة لم يفتح رابطها قط — وقد تكون مؤسسة موقوفة أو مغلقة التسجيل.
 * - **`slug` لا `id`** لأن المعرّف الداخلي لا يُسرَّب للعميل بلا حاجة، والـ slug
 *   مرجع عام أصلًا يظهر في النطاق الفرعي وفي `‎/join?org=`.
 * - **الخادم يحلّ الـ slug دائمًا** ولا يثق بأي معرّف مؤسسة قادم من الواجهة.
 *
 * التوقيع بسرّ الجلسات نفسه (`SESSION_SECRET`) وبفصل نطاق صريح، فلا يصلح توقيع
 * من هنا في أي موضع آخر ولا العكس. والحمولة ليست سرًّا — التوقيع يمنع **التبديل**
 * لا الاطلاع.
 */

const STATE_TTL_MS = 60 * 60 * 1000;
const DOMAIN = "join-context.v1";

export type JoinContext = { organizationSlug: string; issuedAt: number };

function getSigningSecret() {
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  const developmentFallback = process.env.NODE_ENV === "production"
    ? null
    : process.env.CUSTOMER_OTP_PEPPER?.trim();
  const secret = sessionSecret || developmentFallback;
  if (!secret) {
    throw new BusinessError("سرّ التوقيع غير مهيّأ على هذا الخادم. راجع مشغّل النظام.", 503);
  }
  return secret;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSigningSecret()).update(`${DOMAIN}:${payload}`).digest("base64url");
}

/** الشكل: `<payload-base64url>.<signature>`؛ صالح للوضع في رابط أو حقل. */
export function encodeJoinContext(organizationSlug: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ organizationSlug, issuedAt: now }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/**
 * يفكّ السياق ويتحقق من توقيعه وعمره. أي عبث أو انتهاء يعيد `null` —
 * لا استثناء ولا رسالة تشرح للمهاجم أين أخطأ.
 */
export function decodeJoinContext(state: string | null | undefined, now = Date.now()): JoinContext | null {
  if (!state) return null;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  // مقارنة ثابتة الزمن: طول التوقيع ثابت، والاختلاف يُحسم بلا تسريب موضعه.
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return null;
  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JoinContext;
    if (typeof parsed.organizationSlug !== "string" || typeof parsed.issuedAt !== "number") return null;
    if (now - parsed.issuedAt > STATE_TTL_MS || parsed.issuedAt > now + 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * وجهة العودة بعد المصادقة — **مسار داخلي حصرًا**.
 *
 * تُبنى من السياق لا من مدخل المستخدم، وتُفحص رغم ذلك: أي قيمة تبدأ بمخطط أو
 * بشرطتين مائلتين تُرمى ويُعاد المسار الافتراضي، فلا يتحول رابط انضمام إلى
 * تحويل مفتوح لموقع خارجي.
 */
/**
 * وجهة ما بعد المصادقة.
 *
 * تُبنى من **سياق تحقّق الخادم من توقيعه**، لا من قيمة يرسلها العميل. سياق فاسد
 * أو منتهٍ يعيد المسار الافتراضي بصمت — فلا يستطيع أحد أن يحوّل ردّ تسجيل الدخول
 * إلى وجهة يختارها.
 */
export function joinReturnPath(state: string | null | undefined, fallback = "/account") {
  const context = decodeJoinContext(state);
  if (!context) return fallback;
  return safeInternalPath(`/join?state=${encodeURIComponent(state as string)}`, fallback);
}

export function safeInternalPath(path: string | null | undefined, fallback = "/account") {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return fallback;
  if (/[\r\n]/.test(path)) return fallback;
  return path;
}
