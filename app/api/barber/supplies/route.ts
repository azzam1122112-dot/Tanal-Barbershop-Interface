import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireBarberApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { listSupplyItems, reportSupplyShortage } from "@/lib/supplies/supply-service";
import { toErrorResponse } from "@/lib/http/error-response";

const reportSchema = z.object({
  itemId: z.string().trim().min(1, "اختر الصنف"),
  status: z.enum(["LOW", "OUT"]),
  note: z.string().trim().max(200).optional().nullable(),
});

/** مستلزمات فرع الحلاق وحالتها — يراها كل حلاقي الفرع بالحالة نفسها. */
export async function GET() {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const items = await listSupplyItems(prisma, {
    organizationId: session.organizationId,
    salonIds: [session.salonId],
    onlyActive: true,
  });

  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
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
    const result = await reportSupplyShortage(prisma, {
      organizationId: session.organizationId,
      salonId: session.salonId,
      barberId: session.barber.id,
      itemId: parsed.data.itemId,
      status: parsed.data.status,
      note: parsed.data.note,
    });

    // الحالة المعادة تخبر الواجهة بما حدث فعلًا: بلاغ جديد، أم رفع لبلاغ قائم،
    // أم لا شيء لأن زميلًا سبقه — فلا تدّعي الرسالة إرسالًا لم يقع.
    return NextResponse.json(result, { status: result.alreadyOpen ? 200 : 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر إرسال البلاغ");
  }
}
