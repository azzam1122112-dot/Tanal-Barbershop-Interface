import { toErrorResponse } from "@/lib/http/error-response";
import { NextResponse } from "next/server";
import { requireDashboardApi } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { getCampaignWhatsAppAudience } from "@/lib/whatsapp/whatsapp-service";

export async function GET(_request: Request, context: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") return NextResponse.json({ message: "غير مصرح" }, { status: 401 });

  const { campaignId } = await context.params;
  try {
    const customers = await getCampaignWhatsAppAudience(prisma, campaignId, session.organizationId);
    return NextResponse.json({ customers });
  } catch (error) {
    return toErrorResponse(error, "تعذر جلب جمهور الحملة");
  }
}
