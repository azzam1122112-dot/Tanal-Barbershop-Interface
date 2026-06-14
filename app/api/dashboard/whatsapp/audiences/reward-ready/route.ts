import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getRewardReadyWhatsAppAudience } from "@/lib/whatsapp/whatsapp-service";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;

  const customers = await getRewardReadyWhatsAppAudience(prisma);
  return NextResponse.json({ customers });
}
