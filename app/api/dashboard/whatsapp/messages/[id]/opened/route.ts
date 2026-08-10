import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/http/error-response";
import { getRequestMeta, requireLoyaltyOperatorApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { markWhatsAppMessageOpened } from "@/lib/whatsapp/whatsapp-service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireLoyaltyOperatorApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  try {
    const message = await markWhatsAppMessageOpened(prisma, id, {
      actorUserId: session.user.id,
      actorType: session.role,
      organizationId: session.organizationId,
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ message, waUrl: message.waUrl });
  } catch (error) {
    return toErrorResponse(error, "تعذر فتح واتساب");
  }
}
