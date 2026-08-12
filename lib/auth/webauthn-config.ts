import { resolveSiteUrl } from "@/lib/site";

/**
 * إعدادات الطرف المعتمِد (Relying Party) لمفاتيح المرور.
 *
 * **لا تُشتقّ من ترويسات الطلب إطلاقًا.** `Host` قابل للتزوير خلف بروكسي سيئ
 * الإعداد، ومن يزوّره يجعل المتصفح يسجّل مفتاحًا على نطاق يملكه هو. المصدر هنا
 * متغيّر بيئة، وإلا `resolveSiteUrl` — وهو نفسه لا يقرأ ترويسة ويرفض عنوان
 * localhost في الإنتاج.
 *
 * **`RP_ID` نطاق بلا مخطط ولا منفذ**، ويجب أن يكون النطاق الأب المشترك: مفتاح
 * مسجَّل على `www.xmansx.com` لا يعمل على `xmansx.com` والعكس، بينما مفتاح
 * مسجَّل على `xmansx.com` يعمل على كليهما. لذلك القاعدة: **`xmansx.com` مجرّدًا
 * من `www.`** — وهذا ما تفعله `deriveRpId` تلقائيًا.
 */

export type WebAuthnConfig = {
  rpName: string;
  rpId: string;
  /** الأصول المقبولة للتحقق: الأصل القانوني، ومعه نسخة `www` إن وُجدت. */
  expectedOrigins: string[];
};

const DEFAULT_RP_NAME = "XMANSX";

/** ينزع `www.` ليصير المفتاح صالحًا على النطاق وفروعه معًا. */
export function deriveRpId(origin: string) {
  const hostname = new URL(origin).hostname.toLowerCase();
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function getWebAuthnConfig(env: NodeJS.ProcessEnv = process.env): WebAuthnConfig {
  const origin = env.WEBAUTHN_ORIGIN?.trim().replace(/\/+$/, "") || resolveSiteUrl(env.PUBLIC_APP_URL, env.NODE_ENV);
  const rpId = env.WEBAUTHN_RP_ID?.trim().toLowerCase() || deriveRpId(origin);

  // النطاق نفسه بـ `www` وبدونه أصلان مختلفان في نظر المتصفح، وكلاهما مشروع
  // ما دام `rpId` هو الأب المشترك. نقبلهما صراحةً بدل تخمين أيهما زار العميل.
  const expectedOrigins = new Set<string>([origin]);
  try {
    const url = new URL(origin);
    if (url.hostname === rpId) expectedOrigins.add(`${url.protocol}//www.${rpId}${url.port ? `:${url.port}` : ""}`);
  } catch {
    // أصل مشوّه: نكتفي بما ضُبط ولا نخترع بديلًا.
  }

  return {
    rpName: env.WEBAUTHN_RP_NAME?.trim() || DEFAULT_RP_NAME,
    rpId,
    expectedOrigins: [...expectedOrigins],
  };
}

/**
 * بوابة إعداد الإنتاج لمصادقة العميل. لا نكتفي بالقيم المشتقة في الإنتاج لأن
 * تغيّر PUBLIC_APP_URL أو بيئة البناء يجب ألا يغيّر هوية RP أو سر التوقيع بصمت.
 */
export function isCustomerAuthProductionReady(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return true;

  const sessionSecret = env.SESSION_SECRET?.trim() ?? "";
  const otpPepper = env.CUSTOMER_OTP_PEPPER?.trim() ?? "";
  const rpName = env.WEBAUTHN_RP_NAME?.trim() ?? "";
  const rpId = env.WEBAUTHN_RP_ID?.trim().toLowerCase() ?? "";
  const origin = env.WEBAUTHN_ORIGIN?.trim().replace(/\/+$/, "") ?? "";

  return sessionSecret.length >= 32
    && otpPepper.length >= 32
    && rpName === "XMANSX"
    && rpId === "xmansx.com"
    && origin === "https://xmansx.com";
}

/**
 * هل الإعداد صالح للإنتاج؟
 *
 * مفاتيح المرور تشترط أصلًا آمنًا: `https` أو `localhost` للتطوير. لا تجاوز
 * لهذا في الإنتاج — مفتاح على `http` عام يعني توقيعًا يمكن اعتراضه.
 */
export function isSecureWebAuthnOrigin(origin: string) {
  try {
    const url = new URL(origin);
    if (url.protocol === "https:") return true;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
