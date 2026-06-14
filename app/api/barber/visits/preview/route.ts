import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { parseJsonBody, requireBarberApi } from "@/lib/auth/http";
import { visitRequestSchema } from "@/lib/auth/validation";
import { buildVisitPreview } from "@/lib/visits/visit-service";

export async function POST(request: Request) {
  const auth = await requireBarberApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "barber") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  const parsed = visitRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الزيارة غير صحيحة" }, { status: 400 });
  }

  try {
    const preview = await buildVisitPreview(prisma, {
      customerId: parsed.data.customerId,
      barberId: session.barber.id,
      serviceIds: parsed.data.serviceIds,
      grossAmount: parsed.data.grossAmount,
      paymentMethod: parsed.data.paymentMethod,
      campaignId: parsed.data.campaignId,
    });

    return NextResponse.json({ preview });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "تعذر حساب المعاينة" }, { status: 400 });
  }
}
