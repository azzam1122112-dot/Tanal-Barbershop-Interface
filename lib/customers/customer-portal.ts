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

/**
 * يصدر رابط بوابة لصاحب الحساب الموحّد نفسه.
 *
 * **الملكية إثبات أقوى من الرابط السرّي:** الرمز في `/my/[token]` هو السر بذاته،
 * وهذا المسار لا يصدره إلا لجلسة حساب **تملك** سجل العميل (`accountId`) داخل
 * المؤسسة — فمن معه الجلسة يملك البطاقة أصلًا ولا يكشف له هذا شيئًا جديدًا.
 *
 * **ولماذا كان لا بدّ منه:** التسجيل الذاتي من `/join` ينتهي في
 * `/account/loyalty/[slug]` — بطاقة فيها النقاط والفروع وسجل النقاط، وليس فيها
 * حجزٌ ولا عروضٌ ولا قائمة أسعار. كل ذلك يعيش في `/my/[token]` التي لا تُفتح إلا
 * برابط يسلّمه الحلاق يدًا بيد. فمن سجّل نفسه كاملًا **لم يكن يستطيع الحجز
 * أبدًا**، بينما تَعِده صفحةُ الانضمام بأن «نقاطك ومكافآتك وحجوزاتك في بطاقة
 * واحدة». هذا الجسر يفي بالوعد.
 *
 * إصدار رمز جديد يبطل السابق (سياسة الرمز الواحد): من فتح بطاقته من المحفظة
 * يبطل عنده الرابط الذي أرسله الحلاق سابقًا — وهو المقصود، لأن الجديد بيده.
 */
export async function issueAccountPortalToken(
  prisma: PrismaClient,
  input: { accountId: string; organizationSlug: string },
) {
  const slug = input.organizationSlug.trim().toLowerCase();
  if (!slug) throw new BusinessError("البطاقة غير متاحة", 404);

  const customer = await prisma.customer.findFirst({
    // الملكية مفروضة داخل `where` لا بعده: بطاقة حساب آخر لا تُجلب أصلًا.
    where: { accountId: input.accountId, organization: { slug, status: "ACTIVE" } },
    select: { id: true },
  });
  // بطاقة غير مملوكة، أو مرجع مجهول، أو مؤسسة موقوفة: رسالة واحدة لا تفرّق بينها.
  if (!customer) throw new BusinessError("البطاقة غير متاحة", 404);

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
