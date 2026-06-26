import { NextResponse } from "next/server";
import { getRequestMeta, parseJsonBody, requireDashboardApi } from "@/lib/auth/http";
import { campaignUpdateSchema } from "@/lib/auth/validation";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { toSafeCampaign } from "@/lib/campaigns/campaign-summary";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireDashboardApi();
  if (auth.response) return auth.response;
  const session = auth.session;
  if (!session || session.type !== "dashboard") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await parseJsonBody(request);
  const parsed = campaignUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "بيانات الحملة غير صحيحة" }, { status: 400 });
  }

  const before = await prisma.campaign.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!before) {
    return NextResponse.json({ message: "الحملة غير موجودة" }, { status: 404 });
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      ...parsed.data,
      description: parsed.data.description === undefined ? undefined : parsed.data.description,
    },
  });

  await writeAuditLog({
    prisma,
    organizationId: session.organizationId,
    actorType: session.role,
    actorUserId: session.user.id,
    action:
      before.isActive !== campaign.isActive
        ? campaign.isActive
          ? "campaign.enabled"
          : "campaign.disabled"
        : "campaign.updated",
    entityType: "Campaign",
    entityId: campaign.id,
    before: toSafeCampaign(before),
    after: toSafeCampaign(campaign),
    ...(await getRequestMeta()),
  });

  return NextResponse.json({ campaign: toSafeCampaign(campaign) });
}
