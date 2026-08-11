import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";

/**
 * بوابة العميل: رابط سرّي يعرض للعميل رصيد نقاطه ومكافأته القادمة وسجل زياراته.
 *
 * الرمز نفسه هو السر (نمط magic link). لا نخزنه بصورته الأصلية، بل SHA-256 فقط،
 * وله عمر قصير قابل للضبط (30 يومًا افتراضيًا، 90 كحد أقصى).
 */
export function generatePortalToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashPortalToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function portalTokenExpiresAt(now = new Date()) {
  const configured = Number.parseInt(process.env.PORTAL_TOKEN_TTL_DAYS ?? "30", 10);
  const days = Number.isFinite(configured) ? Math.min(90, Math.max(1, configured)) : 30;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

async function issuePortalToken(prisma: PrismaClient, customerId: string) {
  const portalToken = generatePortalToken();
  const issuedAt = new Date();
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      portalTokenHash: hashPortalToken(portalToken),
      portalTokenIssuedAt: issuedAt,
      portalTokenExpiresAt: portalTokenExpiresAt(issuedAt),
    },
  });
  return portalToken;
}

/** يصدر رابطًا جديدًا؛ لا يمكن إعادة عرض الرمز القديم لأن قاعدة البيانات لا تحفظه. */
export async function ensurePortalToken(prisma: PrismaClient, customerId: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  });
  if (!customer) throw new BusinessError("العميل غير موجود", 404);
  return issuePortalToken(prisma, customer.id);
}

/** يبطل الرابط القديم ويصدر رمزًا جديدًا. */
export async function rotatePortalToken(prisma: PrismaClient, customerId: string, organizationId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true },
  });
  if (!customer) throw new BusinessError("العميل غير موجود", 404);

  return issuePortalToken(prisma, customer.id);
}

/**
 * يحلّ العميل من رمز بوابته — **بوابة الهوية الوحيدة** لكل مسارات البوابة العامة.
 *
 * الرمز نفسه هو السر، فأي مسار يقبله لازم يمر من هنا لا أن يستعلم بنفسه:
 * الفحوص الثلاثة (طول الرمز، وجود المؤسسة، عدم إيقافها) في موضع واحد
 * فلا ينسى مسارٌ أحدَها لاحقًا.
 */
export async function resolveCustomerByPortalToken(prisma: PrismaClient, token: string) {
  if (!token || token.length < 16) return null;

  const customer = await prisma.customer.findUnique({
    where: { portalTokenHash: hashPortalToken(token) },
    select: {
      id: true,
      name: true,
      phone: true,
      organizationId: true,
      portalTokenExpiresAt: true,
      organization: { select: { id: true, status: true } },
    },
  });

  if (!customer || !customer.portalTokenExpiresAt || customer.portalTokenExpiresAt <= new Date()) return null;
  if (customer.organization?.status === "SUSPENDED") return null;

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    organizationId: customer.organizationId,
  };
}
