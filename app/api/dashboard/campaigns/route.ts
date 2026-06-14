import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { campaignCreateSchema } from "@/lib/auth/validation";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { toSafeCampaign } from "@/lib/campaigns/campaign-summary";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;

  const campaigns = await prisma.campaign.findMany({ orderBy: [{ createdAt: "desc" }, { name: "asc" }] });
  return NextResponse.json({ campaigns: campaigns.map(toSafeCampaign) });
}

export async function POST(request: Request) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const body = await parseJsonBody(request);
  const parsed = campaignCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الحملة غير صحيحة" }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      targetType: parsed.data.targetType,
      inactiveDays: parsed.data.inactiveDays,
      minPoints: parsed.data.minPoints,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      maxUsesPerCustomer: parsed.data.maxUsesPerCustomer,
      isActive: parsed.data.isActive ?? true,
    },
  });

  await writeAuditLog({
    prisma,
    actorType: session.role,
    actorUserId: session.user.id,
    action: "campaign.created",
    entityType: "Campaign",
    entityId: campaign.id,
    after: toSafeCampaign(campaign),
    ...(await getRequestMeta()),
  });

  return NextResponse.json({ campaign: toSafeCampaign(campaign) }, { status: 201 });
}
