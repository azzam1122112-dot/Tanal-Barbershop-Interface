import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { whatsappGenerateSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { generateWhatsAppMessage } from "@/lib/whatsapp/whatsapp-service";

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = whatsappGenerateSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات توليد رسالة واتساب غير صحيحة" }, { status: 400 });
  }

  try {
    const message = await generateWhatsAppMessage(prisma, parsed.data, {
      actorUserId: session.user.id,
      actorType: session.role,
      ...(await getRequestMeta()),
    });
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "تعذر توليد رسالة واتساب" }, { status: 400 });
  }
}
