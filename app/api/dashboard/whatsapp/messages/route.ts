import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { whatsappMessageListSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { getWhatsAppMessages } from "@/lib/whatsapp/whatsapp-service";

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;

  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = whatsappMessageListSchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json({ message: "فلاتر سجل واتساب غير صحيحة" }, { status: 400 });
  }

  const messages = await getWhatsAppMessages(prisma, parsed.data);
  return NextResponse.json({ messages });
}
