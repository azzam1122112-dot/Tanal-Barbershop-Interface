import { getRequestSession } from "@/lib/auth/http";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { prisma } from "@/lib/db/prisma";
import { isBusinessError } from "@/lib/errors";
import { buildReceipt } from "@/lib/invoicing/receipt";
import { generateReceiptPdf, receiptPdfFilename } from "@/lib/invoicing/receipt-pdf";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession();
  if (!session) return Response.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  const scope = session.type === "barber"
    ? { organizationId: session.organizationId, salonIds: [session.salonId], barberId: session.barber.id }
    : session.type === "dashboard"
      ? { organizationId: session.organizationId, salonIds: effectiveSalonIds(session) }
      : null;

  if (!scope) return Response.json({ message: "غير مصرح" }, { status: 403 });

  try {
    const receipt = await buildReceipt(prisma, id, scope);
    const pdf = await generateReceiptPdf(receipt);
    const filename = receiptPdfFilename(receipt);

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
    if (isBusinessError(error) && error.status === 404) {
      return Response.json({ message: "الإيصال غير موجود" }, { status: 404 });
    }
    logger.error("receipt.pdf.failed", error);
    return Response.json(
      { message: "تعذر إنشاء ملف الإيصال الآن. حاول مرة أخرى أو استخدم صفحة الطباعة." },
      { status: 500 },
    );
  }
}
