import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { getInvoiceForOrganization } from "@/lib/billing/billing-service";
import {
  generateSubscriptionInvoicePdf,
  subscriptionInvoicePdfFilename,
} from "@/lib/billing/subscription-invoice-pdf";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession();
  if (!session) return Response.json({ message: "غير مصرح" }, { status: 401 });
  if (!canAccessDashboard(session) || session.type !== "dashboard") {
    return Response.json({ message: "غير مصرح" }, { status: 403 });
  }

  const { id } = await context.params;
  try {
    const invoice = await getInvoiceForOrganization(prisma, session.organizationId, id);
    if (!invoice) return Response.json({ message: "الفاتورة غير موجودة" }, { status: 404 });

    const pdf = await generateSubscriptionInvoicePdf(invoice);
    const filename = subscriptionInvoicePdfFilename(invoice);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logger.error("billing.invoice_pdf.failed", { error, invoiceId: id, organizationId: session.organizationId });
    return Response.json({ message: "تعذر إنشاء ملف الفاتورة الآن" }, { status: 500 });
  }
}
