import { resolveCustomerByPortalToken } from "@/lib/customers/customer-portal";
import { prisma } from "@/lib/db/prisma";
import { isBusinessError } from "@/lib/errors";
import { buildReceipt } from "@/lib/invoicing/receipt";
import { generateReceiptPdf, receiptPdfFilename } from "@/lib/invoicing/receipt-pdf";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string; visitId: string }> }) {
  const { token, visitId } = await context.params;
  const customer = await resolveCustomerByPortalToken(prisma, token);
  if (!customer) return Response.json({ message: "رابط البطاقة غير صالح" }, { status: 404 });

  try {
    const receipt = await buildReceipt(prisma, visitId, {
      organizationId: customer.organizationId,
      customerId: customer.id,
    });
    const pdf = await generateReceiptPdf(receipt);
    if (pdf.byteLength < 5 || pdf.subarray(0, 5).toString() !== "%PDF-") {
      throw new Error("Generated customer receipt is not a valid PDF document");
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${receiptPdfFilename(receipt)}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isBusinessError(error) && error.status === 404) {
      return Response.json({ message: "الإيصال غير موجود" }, { status: 404 });
    }
    logger.error("customer.receipt.pdf.failed", error);
    return Response.json({ message: "تعذر إنشاء ملف الإيصال الآن. استخدم نسخة الطباعة." }, { status: 500 });
  }
}
