import type { AuditActorType, PaymentProvider, Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { roundMoney } from "@/lib/visits/visit-totals";
import { legalInfo } from "@/lib/legal";

type BillingPrisma = PrismaClient | Prisma.TransactionClient;

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  MANUAL_TRANSFER: "تحويل بنكي",
  MANUAL_CASH: "نقدًا",
};

/**
 * يحسب نهاية الفترة الجديدة بعد دفعة.
 *
 * القاعدة: التجديد **قبل** انتهاء الفترة يمدّد من تاريخ الانتهاء لا من اليوم،
 * فلا يخسر المشترك أيامًا دفع مقابلها. التجديد بعد الانقطاع يبدأ من اليوم.
 */
export function computeNextPeriod(
  currentPeriodEnd: Date | null,
  periodMonths: number,
  now: Date = new Date(),
): { periodStart: Date; periodEnd: Date } {
  const months = Math.max(1, Math.trunc(periodMonths));
  const periodStart = currentPeriodEnd && currentPeriodEnd > now ? new Date(currentPeriodEnd) : new Date(now);
  const periodEnd = addMonths(periodStart, months);
  return { periodStart, periodEnd };
}

/** إضافة شهور مع ضبط نهايات الشهور القصيرة (31 يناير + شهر = 28/29 فبراير). */
export function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const targetDay = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < targetDay) {
    // تجاوزنا إلى الشهر التالي لأن اليوم غير موجود — نرجع لآخر يوم في الشهر المقصود.
    result.setDate(0);
  }
  return result;
}

/** ينشئ طلب دفع تحويل بنكي من مالك/مدير المؤسسة دون تفعيل الباقة قبل المراجعة. */
export async function requestSubscriptionPayment(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    planId: string;
    periodMonths: 1 | 12;
    reference: string;
    actorType: Extract<AuditActorType, "OWNER" | "ADMIN">;
    actorUserId: string;
  },
) {
  const reference = input.reference.trim();
  if (reference.length < 3) throw new BusinessError("أدخل رقم مرجع التحويل");

  const [organization, plan, duplicate, pending] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: input.organizationId },
      include: { _count: { select: { salons: true, barbers: true, customers: true } } },
    }),
    prisma.plan.findFirst({
      where: { id: input.planId, isActive: true, isPublic: true, priceMonthly: { gt: 0 } },
    }),
    prisma.billingInvoice.findUnique({ where: { reference }, select: { id: true } }),
    prisma.billingInvoice.findFirst({
      where: { organizationId: input.organizationId, status: "PENDING" },
      select: { id: true },
    }),
  ]);

  if (!organization) throw new BusinessError("المؤسسة غير موجودة", 404);
  if (!plan) throw new BusinessError("الباقة غير متاحة حاليًا", 404);
  if (duplicate) throw new BusinessError("مرجع التحويل مسجّل مسبقًا", 409);
  if (pending) throw new BusinessError("لديك طلب دفع قيد المراجعة بالفعل", 409);
  if (organization._count.salons > plan.maxSalons) throw new BusinessError("عدد فروعك يتجاوز حد هذه الباقة");
  if (plan.maxBarbers !== null && organization._count.barbers > plan.maxBarbers) {
    throw new BusinessError("عدد حلاقيك يتجاوز حد هذه الباقة");
  }
  if (plan.maxCustomers !== null && organization._count.customers > plan.maxCustomers) {
    throw new BusinessError("عدد عملائك يتجاوز حد هذه الباقة");
  }

  const amount = roundMoney(
    input.periodMonths === 12
      ? Number(plan.priceYearly ?? Number(plan.priceMonthly) * 10)
      : Number(plan.priceMonthly),
  );

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.billingInvoice.create({
      data: {
        organizationId: input.organizationId,
        planId: plan.id,
        provider: "MANUAL_TRANSFER",
        status: "PENDING",
        amount,
        periodMonths: input.periodMonths,
        reference,
        note: "طلب دفع مقدّم من المؤسسة",
      },
      include: { plan: { select: { id: true, name: true } } },
    });
    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        action: "billing.payment_requested",
        entityType: "BillingInvoice",
        entityId: created.id,
        after: { planId: plan.id, amount, periodMonths: input.periodMonths, reference },
      },
    });
    return created;
  });

  return toInvoiceRow(invoice);
}

/** يعتمد مدير المنصة طلب التحويل، ثم يفعّل الباقة ويمدّد الفترة في معاملة واحدة. */
export async function approvePaymentRequest(prisma: PrismaClient, invoiceId: string, platformAdminId: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: { plan: { select: { id: true, name: true } } },
    });
    if (!invoice) throw new BusinessError("طلب الدفع غير موجود", 404);
    if (invoice.status !== "PENDING") throw new BusinessError("طلب الدفع تمت معالجته مسبقًا", 409);

    const organization = await tx.organization.findUnique({
      where: { id: invoice.organizationId },
      select: { id: true, name: true, city: true, currentPeriodEnd: true },
    });
    if (!organization) throw new BusinessError("المؤسسة غير موجودة", 404);

    const now = new Date();
    const { periodStart, periodEnd } = computeNextPeriod(organization.currentPeriodEnd, invoice.periodMonths, now);
    const invoiceNumber = await nextBillingInvoiceNumber(tx, now);
    // المطالبة المشروطة تمنع اعتماد الطلب مرتين إذا ضغط مسؤولان في اللحظة نفسها.
    const claimed = await tx.billingInvoice.updateMany({
      where: { id: invoice.id, status: "PENDING" },
      data: {
        status: "PAID",
        paidAt: now,
        periodStart,
        periodEnd,
        invoiceNumber,
        issuedAt: now,
        sellerName: legalInfo.providerName,
        sellerFreelanceDocument: legalInfo.freelanceDocumentNumber,
        sellerActivity: legalInfo.freelanceActivity,
        buyerName: organization.name,
        buyerCity: organization.city,
        recordedByPlatformAdminId: platformAdminId,
      },
    });
    if (claimed.count !== 1) throw new BusinessError("طلب الدفع تمت معالجته مسبقًا", 409);

    await tx.organization.update({
      where: { id: organization.id },
      data: {
        planId: invoice.planId,
        subscriptionStatus: "ACTIVE",
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        inactiveSince: null,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        actorType: "PLATFORM_ADMIN",
        action: "billing.payment_approved",
        entityType: "BillingInvoice",
        entityId: invoice.id,
        after: { amount: Number(invoice.amount), periodEnd: periodEnd.toISOString(), platformAdminId },
      },
    });
    const updated = await tx.billingInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { plan: { select: { id: true, name: true } } },
    });
    return toInvoiceRow(updated);
  });
}

export async function rejectPaymentRequest(
  prisma: PrismaClient,
  invoiceId: string,
  input: { platformAdminId: string; reason?: string | null },
) {
  const invoice = await prisma.billingInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new BusinessError("طلب الدفع غير موجود", 404);
  if (invoice.status !== "PENDING") throw new BusinessError("طلب الدفع تمت معالجته مسبقًا", 409);

  await prisma.$transaction([
    prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "CANCELLED",
        note: input.reason?.trim() || "رفض مدير المنصة طلب الدفع",
        recordedByPlatformAdminId: input.platformAdminId,
      },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: invoice.organizationId,
        actorType: "PLATFORM_ADMIN",
        action: "billing.payment_rejected",
        entityType: "BillingInvoice",
        entityId: invoice.id,
        after: { reason: input.reason ?? null, platformAdminId: input.platformAdminId },
      },
    }),
  ]);
  return { id: invoice.id };
}

export async function changeSubscriptionRenewal(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    action: "CANCEL" | "RESUME";
    actorType: Extract<AuditActorType, "OWNER" | "ADMIN">;
    actorUserId: string;
  },
) {
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { id: true, subscriptionStatus: true, currentPeriodEnd: true, trialEndsAt: true },
  });
  if (!organization) throw new BusinessError("المؤسسة غير موجودة", 404);

  if (input.action === "RESUME") {
    if (!organization.currentPeriodEnd || organization.currentPeriodEnd <= new Date()) {
      throw new BusinessError("لا يمكن استئناف اشتراك منتهي؛ قدّم طلب دفع جديدًا");
    }
    await prisma.organization.update({ where: { id: organization.id }, data: { subscriptionStatus: "ACTIVE" } });
  } else {
    await prisma.organization.update({ where: { id: organization.id }, data: { subscriptionStatus: "CANCELED" } });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      action: input.action === "CANCEL" ? "subscription.cancellation_scheduled" : "subscription.renewal_resumed",
      entityType: "Organization",
      entityId: organization.id,
      before: { subscriptionStatus: organization.subscriptionStatus },
      after: { subscriptionStatus: input.action === "CANCEL" ? "CANCELED" : "ACTIVE" },
    },
  });

  return {
    subscriptionStatus: input.action === "CANCEL" ? ("CANCELED" as const) : ("ACTIVE" as const),
    effectiveAt: organization.currentPeriodEnd?.toISOString() ?? organization.trialEndsAt?.toISOString() ?? null,
  };
}

/**
 * يسجّل دفعة اشتراك محصّلة يدويًا ويجدّد الاشتراك في معاملة واحدة.
 * تُستدعى من لوحة المنصّة فقط — الفوترة اختصاص مشغّل المنصّة لا المستأجر.
 */
export async function recordManualPayment(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    planId?: string | null;
    amount: number;
    periodMonths: number;
    provider: PaymentProvider;
    reference?: string | null;
    note?: string | null;
    recordedByPlatformAdminId: string;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const amount = roundMoney(input.amount);
  if (amount < 0) throw new BusinessError("المبلغ لا يمكن أن يكون سالبًا");

  const reference = input.reference?.trim() || null;
  if (reference) {
    const duplicate = await prisma.billingInvoice.findUnique({ where: { reference }, select: { id: true } });
    if (duplicate) {
      throw new BusinessError("هذا المرجع مسجّل مسبقًا — الدفعة مُدخلة من قبل", 409);
    }
  }

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true, name: true, city: true, planId: true, currentPeriodEnd: true },
    });
    if (!organization) throw new BusinessError("المؤسسة غير موجودة", 404);

    const planId = input.planId ?? organization.planId ?? null;
    if (planId) {
      const plan = await tx.plan.findUnique({ where: { id: planId }, select: { id: true } });
      if (!plan) throw new BusinessError("الباقة غير موجودة", 404);
    }

    const { periodStart, periodEnd } = computeNextPeriod(organization.currentPeriodEnd, input.periodMonths, now);
    const invoiceNumber = await nextBillingInvoiceNumber(tx, now);

    const invoice = await tx.billingInvoice.create({
      data: {
        organizationId: organization.id,
        planId,
        provider: input.provider,
        status: "PAID",
        amount,
        periodMonths: Math.max(1, Math.trunc(input.periodMonths)),
        reference,
        note: input.note?.trim() || null,
        paidAt: now,
        invoiceNumber,
        issuedAt: now,
        sellerName: legalInfo.providerName,
        sellerFreelanceDocument: legalInfo.freelanceDocumentNumber,
        sellerActivity: legalInfo.freelanceActivity,
        buyerName: organization.name,
        buyerCity: organization.city,
        periodStart,
        periodEnd,
        recordedByPlatformAdminId: input.recordedByPlatformAdminId,
      },
      include: { plan: { select: { id: true, name: true } } },
    });

    // الدفعة تُفعّل الاشتراك وتمسح تاريخ التجربة — لم يعد مجرّبًا بل مشتركًا.
    await tx.organization.update({
      where: { id: organization.id },
      data: {
        planId,
        subscriptionStatus: "ACTIVE",
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        inactiveSince: null,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        actorType: "PLATFORM_ADMIN",
        action: "billing.payment_recorded",
        entityType: "BillingInvoice",
        entityId: invoice.id,
        after: {
          amount,
          periodMonths: invoice.periodMonths,
          periodEnd: periodEnd.toISOString(),
          provider: input.provider,
          reference,
        },
      },
    });

    return toInvoiceRow(invoice);
  });
}

/** يلغي دفعة سُجّلت بالخطأ ويعيد حساب نهاية الفترة من الفواتير المدفوعة المتبقية. */
export async function voidInvoice(
  prisma: PrismaClient,
  invoiceId: string,
  input: { recordedByPlatformAdminId: string; reason?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.billingInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new BusinessError("الفاتورة غير موجودة", 404);
    if (invoice.status !== "PAID") throw new BusinessError("الفاتورة ليست مدفوعة", 409);

    await tx.billingInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "CANCELLED",
        note: input.reason?.trim() || invoice.note,
        // نحرّر المرجع ليُعاد إدخاله صحيحًا بعد التصحيح.
        reference: null,
      },
    });

    // نعيد بناء نهاية الفترة من آخر فاتورة مدفوعة متبقية بدل طرح المدة حسابيًا.
    const latest = await tx.billingInvoice.findFirst({
      where: { organizationId: invoice.organizationId, status: "PAID" },
      orderBy: { periodEnd: "desc" },
      select: { periodEnd: true, planId: true },
    });

    await tx.organization.update({
      where: { id: invoice.organizationId },
      data: {
        currentPeriodEnd: latest?.periodEnd ?? null,
        subscriptionStatus: latest?.periodEnd && latest.periodEnd > new Date() ? "ACTIVE" : "PAST_DUE",
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: invoice.organizationId,
        actorType: "PLATFORM_ADMIN",
        action: "billing.invoice_voided",
        entityType: "BillingInvoice",
        entityId: invoice.id,
        before: { amount: Number(invoice.amount), periodEnd: invoice.periodEnd?.toISOString() ?? null },
        after: { reason: input.reason ?? null },
      },
    });

    return { id: invoice.id };
  });
}

export async function listInvoices(prisma: BillingPrisma, organizationId: string, take = 50) {
  const invoices = await prisma.billingInvoice.findMany({
    where: { organizationId },
    include: { plan: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
  return invoices.map(toInvoiceRow);
}

export async function getInvoiceForOrganization(prisma: BillingPrisma, organizationId: string, invoiceId: string) {
  const invoice = await prisma.billingInvoice.findFirst({
    where: { id: invoiceId, organizationId, status: "PAID" },
    include: {
      plan: { select: { id: true, name: true, description: true } },
      organization: {
        select: {
          name: true,
          city: true,
          users: {
            where: { role: "OWNER", isActive: true },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { name: true, email: true, phone: true },
          },
        },
      },
    },
  });
  if (!invoice) return null;
  return {
    ...toInvoiceRow(invoice),
    planDescription: invoice.plan?.description ?? null,
    buyer: {
      name: invoice.buyerName ?? invoice.organization.name,
      city: invoice.buyerCity ?? invoice.organization.city,
      owner: invoice.organization.users[0] ?? null,
    },
  };
}

/** ملخّص إيرادات المنصّة — ما حُصِّل فعلًا لا ما هو مستحق نظريًا. */
export async function getPlatformRevenueSummary(prisma: BillingPrisma, now: Date = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [thisMonth, allTime, expiringSoon] = await Promise.all([
    prisma.billingInvoice.aggregate({
      where: { status: "PAID", paidAt: { gte: monthStart } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.billingInvoice.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    prisma.organization.count({
      where: {
        subscriptionStatus: "ACTIVE",
        currentPeriodEnd: { gte: now, lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return {
    collectedThisMonth: roundMoney(Number(thisMonth._sum.amount ?? 0)),
    paymentsThisMonth: thisMonth._count,
    collectedAllTime: roundMoney(Number(allTime._sum.amount ?? 0)),
    expiringSoon,
  };
}

function toInvoiceRow(
  invoice: Prisma.BillingInvoiceGetPayload<{ include: { plan: { select: { id: true; name: true } } } }>,
) {
  return {
    id: invoice.id,
    status: invoice.status,
    provider: invoice.provider,
    providerLabel: PAYMENT_PROVIDER_LABELS[invoice.provider],
    amount: Number(invoice.amount),
    currency: invoice.currency,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    sellerName: invoice.sellerName,
    sellerFreelanceDocument: invoice.sellerFreelanceDocument,
    sellerActivity: invoice.sellerActivity,
    periodMonths: invoice.periodMonths,
    reference: invoice.reference,
    note: invoice.note,
    planName: invoice.plan?.name ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    periodStart: invoice.periodStart?.toISOString() ?? null,
    periodEnd: invoice.periodEnd?.toISOString() ?? null,
    createdAt: invoice.createdAt.toISOString(),
  };
}

async function nextBillingInvoiceNumber(tx: Prisma.TransactionClient, now: Date) {
  const year = now.getUTCFullYear();
  const counter = await tx.billingInvoiceCounter.upsert({
    where: { year },
    create: { year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  return `XM-${year}-${String(counter.lastValue).padStart(6, "0")}`;
}
