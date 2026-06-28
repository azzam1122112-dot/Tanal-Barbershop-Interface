import { NextResponse } from "next/server";
import { getRequestMeta, requireAdminApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { markWhatsAppMessageSent } from "@/lib/whatsapp/whatsapp-service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  try {
    const message = await markWhatsAppMessageSent(prisma, id, {
      actorUserId: session.user.id,
      actorType: session.role,
      organizationId: session.organizationId,
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ message: "تعذر تعليم رسالة واتساب كمرسلة يدويًا" }, { status: 400 });
  }
}
