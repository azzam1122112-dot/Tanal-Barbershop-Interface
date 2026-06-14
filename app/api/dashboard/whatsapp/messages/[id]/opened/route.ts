import { NextResponse } from "next/server";
import { getRequestMeta, requireDashboardApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { markWhatsAppMessageOpened } from "@/lib/whatsapp/whatsapp-service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { id } = await context.params;
  try {
    const message = await markWhatsAppMessageOpened(prisma, id, {
      actorUserId: session.user.id,
      actorType: session.role,
      ...(await getRequestMeta()),
    });
    return NextResponse.json({ message, waUrl: message.waUrl });
  } catch {
    return NextResponse.json({ message: "تعذر تحديث حالة فتح واتساب" }, { status: 400 });
  }
}
