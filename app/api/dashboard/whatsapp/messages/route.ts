import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/http";
import { whatsappMessageListSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { getWhatsAppMessages } from "@/lib/whatsapp/whatsapp-service";

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = whatsappMessageListSchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json({ message: "فلاتر سجل واتساب غير صحيحة" }, { status: 400 });
  }

  const messages = await getWhatsAppMessages(prisma, { ...parsed.data, organizationId: session.organizationId });
  return NextResponse.json({ messages });
}
