import type { PrismaClient } from "@prisma/client";
import { getInvoiceForOrganization } from "@/lib/billing/billing-service";
import {
  generateSubscriptionInvoicePdf,
  subscriptionInvoicePdfFilename,
} from "@/lib/billing/subscription-invoice-pdf";
import { renderSubscriptionInvoiceEmail } from "@/lib/email/customer-email-templates";
import { sendTransactionalEmail } from "@/lib/email/resend-email";
import { BusinessError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { resolveSiteUrl } from "@/lib/site";

export type SubscriptionInvoiceEmailResult = {
  sent: boolean;
  recipient: string | null;
  providerId: string | null;
  message: string;
};

/**
 * يرسل نسخة PDF بعد اكتمال معاملة التفعيل. فشل البريد لا يلغي اشتراكًا
 * مدفوعًا؛ يُسجّل على الفاتورة ويظل قابلاً لإعادة الإرسال من لوحة المنصة.
 */
export async function deliverSubscriptionInvoiceEmail(
  prisma: PrismaClient,
  organizationId: string,
  invoiceId: string,
): Promise<SubscriptionInvoiceEmailResult> {
  const invoice = await getInvoiceForOrganization(prisma, organizationId, invoiceId);
  if (!invoice) throw new BusinessError("الفاتورة المدفوعة غير موجودة", 404);

  const recipient = invoice.buyer.owner?.email?.trim().toLowerCase() || null;
  const attempt = await prisma.billingInvoice.update({
    where: { id: invoice.id },
    data: {
      invoiceEmailAttempts: { increment: 1 },
      invoiceEmailRecipient: recipient,
      invoiceEmailLastError: null,
    },
    select: { invoiceEmailAttempts: true },
  });

  if (!recipient) {
    const message = "لا يوجد بريد إلكتروني مسجّل لمالك المؤسسة";
    await markFailure(prisma, invoice.id, message);
    return { sent: false, recipient: null, providerId: null, message };
  }

  try {
    const pdf = await generateSubscriptionInvoicePdf(invoice);
    const invoiceNumber = invoice.invoiceNumber ?? invoice.id;
    const template = renderSubscriptionInvoiceEmail({
      ownerName: invoice.buyer.owner?.name ?? invoice.buyer.name,
      organizationName: invoice.buyer.name,
      invoiceNumber,
      planName: invoice.planName ?? "إكس مانس إكس XMANSX",
      amount: invoice.amount,
      periodStart: invoice.periodStart ?? invoice.paidAt ?? invoice.createdAt,
      periodEnd: invoice.periodEnd ?? invoice.paidAt ?? invoice.createdAt,
      invoiceUrl: new URL(
        `/dashboard/subscription/invoices/${invoice.id}`,
        `${resolveSiteUrl(process.env.PUBLIC_APP_URL, "production")}/`,
      ).toString(),
    });
    const result = await sendTransactionalEmail({
      to: recipient,
      subject: `فاتورة الاشتراك ${invoiceNumber} · تم تفعيل باقتك`,
      ...template,
      idempotencyKey: `subscription-invoice/${invoice.id}/${attempt.invoiceEmailAttempts}`,
      tags: [{ name: "message_type", value: "subscription_invoice" }],
      attachments: [{
        filename: subscriptionInvoicePdfFilename(invoice),
        content: pdf.toString("base64"),
      }],
    });

    await prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: {
        invoiceEmailProviderId: result.id,
        invoiceEmailSentAt: new Date(),
        invoiceEmailLastError: null,
      },
    });
    return {
      sent: true,
      recipient,
      providerId: result.id,
      message: "تم إرسال الفاتورة إلى البريد المسجّل",
    };
  } catch (error) {
    const message = "تعذر إرسال الفاتورة إلى البريد حاليًا";
    await markFailure(prisma, invoice.id, message);
    logger.error("billing.invoice_email.failed", {
      error,
      invoiceId: invoice.id,
      organizationId,
      attempt: attempt.invoiceEmailAttempts,
    });
    return { sent: false, recipient, providerId: null, message };
  }
}

async function markFailure(prisma: PrismaClient, invoiceId: string, message: string) {
  await prisma.billingInvoice.update({
    where: { id: invoiceId },
    data: { invoiceEmailLastError: message },
  });
}
