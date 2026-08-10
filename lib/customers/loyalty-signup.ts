import type { PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { createCustomerWithLoyalty } from "@/lib/customers/customer-service";
import { ensurePortalToken } from "@/lib/customers/customer-portal";
import { assertSubscriptionActive } from "@/lib/plans/subscription-guard";
import { normalizeSaudiPhone } from "@/lib/phone/saudi-phone";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { LEGAL_VERSION } from "@/lib/legal";

export type LoyaltySignupResult =
  | { outcome: "CREATED"; portalPath: string; customerId: string }
  // العميل مسجّل مسبقًا: لا نكشف رابطه ولا رصيده لمن يعرف رقمه فقط.
  | { outcome: "ALREADY_REGISTERED" };

/**
 * تسجيل ذاتي في برنامج الولاء من نموذج عام (بلا جلسة).
 *
 * **قرار خصوصية:** الرقم المسجّل مسبقًا لا يُعاد له الرابط أبدًا — وإلا لأمكن
 * لأي شخص إدخال أرقام ليعرف من هم عملاء الصالون ويطّلع على سجل زياراتهم.
 * صاحب الرقم يأخذ رابطه من الحلاق عند زيارته.
 */
export async function selfRegisterForLoyalty(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    name: string;
    phone: string;
    /** مفتاح تحديد المعدّل — عنوان IP الطالب. */
    rateLimitKey: string;
    whatsappTransactionalOptIn?: boolean;
    whatsappMarketingOptIn?: boolean;
    privacyNoticeAcknowledged: true;
    privacyNoticeControllerName: string;
  },
): Promise<LoyaltySignupResult> {
  const name = input.name.trim();
  if (name.length < 2) throw new BusinessError("الاسم مطلوب");

  // نموذج عام مفتوح: نحدّ المعدّل قبل أي كتابة لمنع إغراق قائمة العملاء.
  const rate = await consumeRateLimit(prisma, `loyalty-signup:${input.rateLimitKey}`);
  if (rate.limited) {
    throw new BusinessError("محاولات كثيرة. حاول بعد قليل.", 429);
  }

  const phone = normalizeSaudiPhone(input.phone);
  await assertSubscriptionActive(prisma, input.organizationId);

  const existing = await prisma.customer.findFirst({
    where: { organizationId: input.organizationId, phone },
    select: { id: true },
  });
  if (existing) {
    return { outcome: "ALREADY_REGISTERED" };
  }

  const { customer } = await createCustomerWithLoyalty({
    prisma,
    organizationId: input.organizationId,
    name,
    phone,
    whatsappTransactionalOptIn: input.whatsappTransactionalOptIn ?? false,
    whatsappMarketingOptIn: input.whatsappMarketingOptIn ?? false,
    whatsappConsentSource: "WEBSITE",
    privacyNotice: {
      acknowledgedAt: new Date(),
      version: LEGAL_VERSION,
      controllerName: input.privacyNoticeControllerName,
    },
  });

  const token = await ensurePortalToken(prisma, customer.id, input.organizationId);

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorType: "SYSTEM",
      action: "customer.self_registered",
      entityType: "Customer",
      entityId: customer.id,
      after: {
        name,
        phone,
        whatsappTransactionalOptIn: input.whatsappTransactionalOptIn ?? false,
        whatsappMarketingOptIn: input.whatsappMarketingOptIn ?? false,
        whatsappConsentSource: "WEBSITE",
        privacyNoticeAcknowledged: true,
        privacyNoticeVersion: LEGAL_VERSION,
        privacyNoticeControllerName: input.privacyNoticeControllerName,
      },
    },
  });

  return { outcome: "CREATED", portalPath: `/my/${token}`, customerId: customer.id };
}
