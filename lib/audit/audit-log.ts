import crypto from "crypto";
import type { AuditActorType, Prisma, PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";

type AuditPrisma = PrismaClient | Prisma.TransactionClient;
const SECRET_KEY = /(password|secret|token|authorization|cookie|session|otp|pin|api[-_]?key|private[-_]?key)/i;
const CONTENT_KEY = /^(message|waUrl|body|content|notes?|description)$/i;
const PHONE_KEY = /(phone|mobile|recipient)/i;
const EMAIL_KEY = /email/i;

export function sanitizeAuditValue(value: unknown, key = "", depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (CONTENT_KEY.test(key)) return "[CONTENT_REDACTED]";
  if (typeof value === "string") {
    if (PHONE_KEY.test(key)) return value.length > 6 ? `${value.slice(0, 3)}***${value.slice(-3)}` : "***";
    if (EMAIL_KEY.test(key)) return value.replace(/^(.).*(@.*)$/, "$1***$2");
    return value
      .replace(/([\w.+-])([\w.+-]*)@([\w-]+\.[\w.-]+)/g, "$1***@$3")
      .replace(/\b(?:\+?966|0)?5\d{8}\b/g, (phone) => `${phone.slice(0, 3)}***${phone.slice(-3)}`)
      .slice(0, 500);
  }
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeAuditValue(item, key, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([childKey, item]) => [
    childKey,
    sanitizeAuditValue(item, childKey, depth + 1),
  ]));
}

/**
 * إخفاء هوية عنوان الشبكة في سجل التدقيق.
 *
 * **لماذا HMAC لا SHA-256:** فضاء IPv4 كامله 2³² عنوانًا — أي أن تجزئة عمياء
 * بلا مفتاح تُعكس بجدول يُبنى في دقائق على جهاز عادي. الحقل كان يُسمّى
 * «pseudonymize» ويَعِد بحماية لا يقدّمها، فيُقرأ سجل التدقيق كأن العناوين فيه
 * مخفية بينما هي عمليًا نصّ ظاهر. المفتاح السرّي يقطع ذلك: بلا تسريبه لا يُعكس
 * أي مدخل، ومع بقاء نفس المفتاح يبقى ربط سجلين لعنوان واحد ممكنًا كما كان.
 *
 * **البادئة نسخة لا زينة:** `v2:` تفصل المكتوب بالمفتاح عن قيم `sha256:`
 * القديمة. القيمتان لنفس العنوان مختلفتان بالضرورة، فالبادئة تمنع أن يُقارَن
 * سجلٌ قديم بجديد ويُستنتج أنهما جهازان مختلفان.
 *
 * **ولا تُسقط العملية أبدًا:** كتابة التدقيق تجري داخل معاملات مالية، ورمي خطأ
 * هنا يُفشل زيارةً أو إقفال صندوق. غياب المفتاح في الإنتاج يُسجَّل ويُكتب
 * `v2:unkeyed` — علامة غياب صريحة، لا عنوانًا مكشوفًا ولا تجزئة قابلة للعكس.
 */
const IP_PSEUDONYM_VERSION = "v2";
const MIN_IP_KEY_LENGTH = 32;

export function pseudonymizeIp(value?: string | null, env: NodeJS.ProcessEnv = process.env) {
  if (!value) return null;

  const secret = env.SESSION_SECRET?.trim();
  if (!secret || secret.length < MIN_IP_KEY_LENGTH) {
    if (env.NODE_ENV === "production") {
      logger.error("audit.ip_pseudonym_key_missing", {
        reason: `SESSION_SECRET أقصر من ${MIN_IP_KEY_LENGTH} محرفًا أو غير مضبوط`,
      });
      return `${IP_PSEUDONYM_VERSION}:unkeyed`;
    }
    // التطوير: مفتاح ثابت معلن حتى تبقى القيم مستقرة بين التشغيلات، والعناوين
    // محليّة أصلًا. لا يُستخدم هذا الفرع في الإنتاج بحكم الشرط أعلاه.
    return hmacIp(value, "xmansx-development-audit-ip-key-not-a-secret");
  }

  return hmacIp(value, secret);
}

function hmacIp(value: string, key: string) {
  return `${IP_PSEUDONYM_VERSION}:${crypto.createHmac("sha256", key).update(value).digest("hex").slice(0, 32)}`;
}

export async function writeAuditLog({
  prisma,
  organizationId,
  salonId,
  actorType,
  actorUserId,
  actorBarberId,
  action,
  entityType,
  entityId,
  before,
  after,
  ipAddress,
  userAgent,
}: {
  prisma: AuditPrisma;
  organizationId?: string | null;
  salonId?: string | null;
  actorType: AuditActorType;
  actorUserId?: string | null;
  actorBarberId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return prisma.auditLog.create({
    data: {
      organizationId,
      salonId,
      actorType,
      actorUserId,
      actorBarberId,
      action,
      entityType,
      entityId,
      before: before === undefined ? undefined : JSON.parse(JSON.stringify(sanitizeAuditValue(before))),
      after: after === undefined ? undefined : JSON.parse(JSON.stringify(sanitizeAuditValue(after))),
      ipAddress: pseudonymizeIp(ipAddress),
      userAgent: userAgent?.slice(0, 300) ?? null,
    },
  });
}
