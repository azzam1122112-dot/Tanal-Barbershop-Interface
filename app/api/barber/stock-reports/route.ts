import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { createStockReport, listStockReports } from "@/lib/products/stock-report-service";
import { toErrorResponse } from "@/lib/http/error-response";

const reportSchema = z.object({
  productId: z.string().trim().min(1, "اختر المنتج"),
  type: z.enum(["LOW_STOCK", "DAMAGED", "MISSING"]),
  quantity: z.coerce.number().int().positive().optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

/** بلاغات الحلاق نفسه — يراها ليعرف ما اعتُمد منها وما رُفض. */
export async function GET() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const reports = await listStockReports(prisma, {
    organizationId: session.organizationId,
    salonIds: [session.salonId],
    barberId: session.barber.id,
    take: 20,
  });

  return NextResponse.json({ reports }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = reportSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "بيانات البلاغ غير صحيحة" }, { status: 400 });
  }

  try {
    const report = await createStockReport(prisma, {
      organizationId: session.organizationId,
      salonId: session.salonId,
      barberId: session.barber.id,
      productId: parsed.data.productId,
      type: parsed.data.type,
      quantity: parsed.data.quantity,
      note: parsed.data.note,
    });
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر إرسال البلاغ");
  }
}
