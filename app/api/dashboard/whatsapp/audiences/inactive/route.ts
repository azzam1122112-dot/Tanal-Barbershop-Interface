import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { whatsappInactiveAudienceSchema } from "@/lib/auth/validation";
import { prisma } from "@/lib/db/prisma";
import { getInactiveWhatsAppAudience } from "@/lib/whatsapp/whatsapp-service";

export async function GET(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const parsed = whatsappInactiveAudienceSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ message: "فلتر العملاء المنقطعين غير صحيح" }, { status: 400 });

  const customers = await getInactiveWhatsAppAudience(prisma, parsed.data.days, session.organizationId);
  return NextResponse.json({ customers });
}
