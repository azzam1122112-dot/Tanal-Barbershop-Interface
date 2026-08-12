import { BusinessError } from "@/lib/errors";
import { renderCustomerEmail } from "@/lib/email/customer-email-templates";
import { getEmailConfiguration, sendTransactionalEmail } from "@/lib/email/resend-email";
import { logger } from "@/lib/logger";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey?: string;
  tags?: Array<{ name: string; value: string }>;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/**
 * المزوّد الافتراضي: يفشل بوضوح.
 *
 * **لماذا الفشل هو الافتراض:** بديله أن يبتلع الإرسال بصمت، فيظن المشغّل أن
 * البريد يعمل ويكتشف العكس من شكوى عميل لم يصله رمزه. الفشل الصريح يجعل غياب
 * الإعداد خطأ إعداد مرئيًا لا عطلًا صامتًا. ولا يسرّب شيئًا: الرسالة تقول إن
 * البريد غير مهيّأ ولا تذكر مستقبِلًا ولا محتوى.
 */
class UnconfiguredEmailProvider implements EmailProvider {
  readonly name = "unconfigured";

  async send(): Promise<void> {
    throw new BusinessError("خدمة البريد غير مهيّأة على هذا الخادم. راجع مشغّل النظام.", 503);
  }
}

/**
 * مزوّد تطوير يطبع الرسالة في السجل — **ممنوع في الإنتاج**.
 *
 * يطبع الرمز، وهو ما تمنعه قاعدة «لا تسجّل OTP». الاستثناء مقصور على جهاز
 * المطوّر ومشروط بطلب صريح عبر `EMAIL_PROVIDER=console`، ويرفض العمل إذا كانت
 * البيئة إنتاجًا مهما ضُبط المتغيّر.
 */
class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  async send(message: EmailMessage): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new BusinessError("مزوّد البريد الطباعي غير مسموح في الإنتاج.", 503);
    }
    logger.warn("email.console_provider", { to: message.to, subject: message.subject, text: message.text });
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  async send(message: EmailMessage): Promise<void> {
    const fallback = renderCustomerEmail({
      preheader: message.subject,
      title: message.subject,
      body: message.text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean),
    });
    await sendTransactionalEmail({
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? fallback.html,
      idempotencyKey: message.idempotencyKey ?? `email/${crypto.randomUUID()}`,
      tags: message.tags,
    });
  }
}

let override: EmailProvider | null = null;

/**
 * حقن مزوّد للاختبار. الاستدعاء بلا وسيط يعيد الاختيار إلى البيئة.
 * منطق الأعمال لا يعرف أي مزوّد إطلاقًا — يستدعي `sendEmail` وحدها.
 */
export function setEmailProvider(provider: EmailProvider | null) {
  override = provider;
}

export function getEmailProvider(): EmailProvider {
  if (override) return override;
  if (process.env.EMAIL_PROVIDER === "console") return new ConsoleEmailProvider();
  if (getEmailConfiguration().enabled) return new ResendEmailProvider();
  return new UnconfiguredEmailProvider();
}

/** هل البريد جاهز للإنتاج؟ تُستخدم للعرض الإداري لا للتحكّم في المسار. */
export function isEmailConfigured() {
  return getEmailProvider().name !== "unconfigured";
}

export async function sendEmail(message: EmailMessage) {
  await getEmailProvider().send(message);
}
