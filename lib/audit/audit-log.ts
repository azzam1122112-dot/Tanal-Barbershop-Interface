import crypto from "crypto";
import type { AuditActorType, Prisma, PrismaClient } from "@prisma/client";

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

function pseudonymizeIp(value?: string | null) {
  if (!value) return null;
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
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
