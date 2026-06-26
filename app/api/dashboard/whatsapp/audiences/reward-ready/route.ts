import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getRewardReadyWhatsAppAudience } from "@/lib/whatsapp/whatsapp-service";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const customers = await getRewardReadyWhatsAppAudience(prisma, session.organizationId);
  return NextResponse.json({ customers });
}
