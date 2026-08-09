import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireLoyaltyOperatorApi } from "@/lib/auth/http";
import { whatsappSafetySettingsSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { toErrorResponse } from "@/lib/http/error-response";
import { getWhatsAppSafetyOverview, updateWhatsAppSafetySettings } from "@/lib/whatsapp/whatsapp-safety";

export async function GET() {
  const auth = await requireLoyaltyOperatorApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  try {
    return NextResponse.json(await getWhatsAppSafetyOverview(prisma, session.organizationId));
  } catch (error) {
    return toErrorResponse(error, "تعذر تحميل مركز حماية واتساب");
  }
}

export async function PATCH(request: Request) {
  const auth = await requireLoyaltyOperatorApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = whatsappSafetySettingsSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "إعدادات الحماية غير صحيحة" }, { status: 400 });
  }

  try {
    const settings = await updateWhatsAppSafetySettings(prisma, parsed.data, {
      actorUserId: session.user.id,
      actorType: session.role,
      organizationId: session.organizationId,
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ settings });
  } catch (error) {
    return toErrorResponse(error, "تعذر تحديث مركز حماية واتساب");
  }
}
