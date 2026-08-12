import { normalizeEmail } from "@/lib/email/normalize-email";
import { logger } from "@/lib/logger";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_SUBJECT_LENGTH = 998;
const MAX_IDEMPOTENCY_KEY_LENGTH = 256;

type EmailEnvironment = {
  [key: string]: string | undefined;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  EMAIL_PLATFORM_TAG?: string;
  EMAIL_REQUIRED?: string;
};

export type EmailConfiguration = {
  enabled: boolean;
  required: boolean;
  from: string | null;
  replyTo: string | null;
  platformTag: string | null;
  missing: string[];
};

export type TransactionalEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  replyTo?: string;
  threading?: { inReplyTo: string; references?: string[] };
  tags?: Array<{ name: string; value: string }>;
};

export class EmailDeliveryError extends Error {
  readonly status: number | null;
  readonly providerCode: string | null;

  constructor(message: string, options: { status?: number | null; providerCode?: string | null } = {}) {
    super(message);
    this.name = "EmailDeliveryError";
    this.status = options.status ?? null;
    this.providerCode = options.providerCode ?? null;
  }
}

export function getEmailConfiguration(env: EmailEnvironment = process.env): EmailConfiguration {
  const apiKey = env.RESEND_API_KEY?.trim() ?? "";
  const from = env.EMAIL_FROM?.trim() ?? "";
  const replyTo = env.EMAIL_REPLY_TO?.trim() ?? "";
  const platformTag = env.EMAIL_PLATFORM_TAG?.trim() ?? "";
  const missing = [
    ...(apiKey ? [] : ["RESEND_API_KEY"]),
    ...(from ? [] : ["EMAIL_FROM"]),
  ];

  return {
    enabled: missing.length === 0,
    required: env.EMAIL_REQUIRED === "true",
    from: from || null,
    replyTo: replyTo || null,
    platformTag: platformTag || null,
    missing,
  };
}

export function isEmailConfigurationReady(env: EmailEnvironment = process.env) {
  const config = getEmailConfiguration(env);
  return !config.required || config.enabled;
}

/**
 * إرسال بريدي منخفض المستوى عبر Resend.
 *
 * لا تُقبل مفاتيح المزود أو عنوان المرسل من المستدعي: مصدرها الوحيد بيئة
 * الخادم، وبذلك لا يمكن لمسار واجهة تحويل هذه الدالة إلى عميل HTTP عام أو
 * تسريب المفتاح. مفتاح منع التكرار إلزامي لكل رسالة تشغيلية.
 */
export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; env?: EmailEnvironment } = {},
) {
  const env = options.env ?? process.env;
  const config = getEmailConfiguration(env);
  if (!config.enabled) {
    throw new EmailDeliveryError(`إعداد البريد غير مكتمل: ${config.missing.join(", ")}`);
  }

  const recipients = (Array.isArray(input.to) ? input.to : [input.to]).map(normalizeEmail);
  if (recipients.length === 0 || recipients.length > 50) {
    throw new EmailDeliveryError("عدد مستلمي البريد يجب أن يكون بين 1 و50");
  }

  const subject = input.subject.trim();
  if (!subject || subject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(subject)) {
    throw new EmailDeliveryError("عنوان الرسالة غير صالح");
  }

  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH || /[\r\n]/.test(idempotencyKey)) {
    throw new EmailDeliveryError("مفتاح منع تكرار البريد غير صالح");
  }

  const replyTo = input.replyTo ? normalizeEmail(input.replyTo) : config.replyTo;
  const threadingHeaders = buildThreadingHeaders(input.threading);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await (options.fetchImpl ?? fetch)(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY?.trim()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: recipients,
        subject,
        html: input.html,
        text: input.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(threadingHeaders ? { headers: threadingHeaders } : {}),
        ...buildTags(config.platformTag, input.tags),
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({})) as {
      id?: string;
      name?: string;
      type?: string;
      message?: string;
    };

    if (!response.ok || !payload.id) {
      const providerCode = payload.name ?? payload.type ?? null;
      logger.warn("email.resend_rejected", {
        status: response.status,
        providerCode,
        recipientCount: recipients.length,
      });
      throw new EmailDeliveryError("تعذر تسليم الرسالة إلى مزود البريد", {
        status: response.status,
        providerCode,
      });
    }

    logger.info("email.resend_accepted", {
      emailId: payload.id,
      recipientCount: recipients.length,
      tags: input.tags,
    });
    return { id: payload.id };
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new EmailDeliveryError("انتهت مهلة الاتصال بمزود البريد");
    }
    throw new EmailDeliveryError("تعذر الاتصال بمزود البريد");
  } finally {
    clearTimeout(timeout);
  }
}

function buildThreadingHeaders(threading: TransactionalEmailInput["threading"]) {
  if (!threading) return null;
  const allowedMessageId = /^<[^<>\r\n]{1,990}>$/;
  const inReplyTo = threading.inReplyTo.trim();
  const references = (threading.references ?? []).map((value) => value.trim());
  if (!allowedMessageId.test(inReplyTo) || references.some((value) => !allowedMessageId.test(value))) {
    throw new EmailDeliveryError("معرّف سلسلة البريد غير صالح");
  }
  const uniqueReferences = [...new Set([...references, inReplyTo])].slice(-20);
  return {
    "In-Reply-To": inReplyTo,
    References: uniqueReferences.join(" "),
  };
}

function buildTags(platformTag: string | null, tags: TransactionalEmailInput["tags"]) {
  const normalizedTags = (tags ?? [])
    .filter((tag) => tag.name.trim() !== "platform")
    .map(normalizeTag);
  const combinedTags = platformTag
    ? [{ name: "platform", value: platformTag }, ...normalizedTags]
    : normalizedTags;
  return combinedTags.length ? { tags: combinedTags.map(normalizeTag) } : {};
}

function normalizeTag(tag: { name: string; value: string }) {
  const name = tag.name.trim();
  const value = tag.value.trim();
  const allowed = /^[A-Za-z0-9_-]{1,256}$/;
  if (!allowed.test(name) || !allowed.test(value)) {
    throw new EmailDeliveryError("وسم البريد غير صالح");
  }
  return { name, value };
}
