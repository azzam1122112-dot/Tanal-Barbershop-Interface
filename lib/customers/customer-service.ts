import type { Prisma, PrismaClient, WhatsAppConsentSource } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { lockTenantQuota } from "@/lib/db/tenant-lock";

type CustomerWithOperationalSummary = Prisma.CustomerGetPayload<{
  include: {
    loyaltyAccount: true;
    visits: { include: { barber: true; services: true } };
  };
}>;

/** يمنع تجاوز حد العملاء في الباقة. `maxCustomers = null` يعني بلا حد. */
async function assertCustomerQuota(prisma: Prisma.TransactionClient, organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { plan: { select: { maxCustomers: true } }, _count: { select: { customers: true } } },
  });
  if (!organization) throw new BusinessError("المؤسسة غير موجودة", 404);

  const maxCustomers = organization.plan?.maxCustomers ?? null;
  if (maxCustomers !== null && organization._count.customers >= maxCustomers) {
    throw new BusinessError(`باقتك تسمح بـ ${maxCustomers} عميل. رقّ باقتك لإضافة عملاء أكثر.`, 402);
  }
}

export async function createCustomerWithLoyalty({
  prisma,
  organizationId,
  name,
  phone,
  createdByBarberId,
  whatsappTransactionalOptIn = false,
  whatsappMarketingOptIn = false,
  enrollInLoyalty = true,
  whatsappConsentSource,
  privacyNotice,
}: {
  prisma: PrismaClient;
  organizationId: string;
  name: string;
  phone: string;
  createdByBarberId?: string | null;
  whatsappTransactionalOptIn?: boolean;
  whatsappMarketingOptIn?: boolean;
  /** العضوية اختيارية للحلاق؛ التسجيل الذاتي ومسارات الإدارة تبقي القيمة الافتراضية مفعّلة. */
  enrollInLoyalty?: boolean;
  whatsappConsentSource?: WhatsAppConsentSource;
  privacyNotice?: { acknowledgedAt: Date; version: string; controllerName: string };
}) {
  return prisma.$transaction(async (tx) => {
    await lockTenantQuota(tx, organizationId, "customers");
    const existing = await tx.customer.findFirst({
      where: { organizationId, phone },
      include: {
        loyaltyAccount: true,
        visits: { orderBy: { visitedAt: "desc" }, take: 1, include: { barber: true, services: true } },
      },
    });
    if (existing) return { customer: existing, created: false };

    await assertCustomerQuota(tx, organizationId);
    const customer: CustomerWithOperationalSummary = await tx.customer.create({
      data: {
        organizationId,
        name,
        phone,
        createdByBarberId,
        whatsappOptIn: whatsappTransactionalOptIn || whatsappMarketingOptIn,
        whatsappTransactionalOptIn,
        whatsappMarketingOptIn,
        whatsappConsentSource: whatsappTransactionalOptIn || whatsappMarketingOptIn ? whatsappConsentSource : undefined,
        whatsappTransactionalConsentAt: whatsappTransactionalOptIn ? new Date() : undefined,
        whatsappMarketingConsentAt: whatsappMarketingOptIn ? new Date() : undefined,
        privacyNoticeAcknowledgedAt: privacyNotice?.acknowledgedAt,
        privacyNoticeVersion: privacyNotice?.version,
        privacyNoticeControllerName: privacyNotice?.controllerName,
        loyaltyAccount: enrollInLoyalty ? { create: { organizationId } } : undefined,
      },
      include: {
        loyaltyAccount: true,
        visits: { orderBy: { visitedAt: "desc" }, take: 1, include: { barber: true, services: true } },
      },
    });
    return { customer, created: true };
  }, { isolationLevel: "Serializable" });
}
