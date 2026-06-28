import { toErrorResponse } from "@/lib/http/error-response";
import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireAdminApi } from "@/lib/auth/http";
import { whatsappGenerateSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { generateWhatsAppMessage } from "@/lib/whatsapp/whatsapp-service";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
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
      organizationId: session.organizationId,
      ...(await getRequestMeta()),
    });
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "تعذر توليد رسالة واتساب");
  }
}
