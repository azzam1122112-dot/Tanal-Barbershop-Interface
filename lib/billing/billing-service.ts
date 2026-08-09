import type { PaymentProvider, Prisma, PrismaClient } from "@prisma/client";
import { BusinessError } from "@/lib/errors";
import { roundMoney } from "@/lib/visits/visit-totals";

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
      select: { id: true, planId: true, currentPeriodEnd: true },
    });
    if (!organization) throw new BusinessError("المؤسسة غير موجودة", 404);

    const planId = input.planId ?? organization.planId ?? null;
    if (planId) {
      const plan = await tx.plan.findUnique({ where: { id: planId }, select: { id: true } });
      if (!plan) throw new BusinessError("الباقة غير موجودة", 404);
    }

    const { periodStart, periodEnd } = computeNextPeriod(organization.currentPeriodEnd, input.periodMonths, now);

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
