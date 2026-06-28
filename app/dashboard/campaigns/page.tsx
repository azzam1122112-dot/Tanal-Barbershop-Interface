import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { CampaignManager } from "@/components/dashboard/campaign-manager";
import { canAccessDashboard, canManageStaff } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { toSafeCampaign } from "@/lib/campaigns/campaign-summary";
import { prisma } from "@/lib/db/prisma";

export default async function DashboardCampaignsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canManageStaff(session)) redirect("/dashboard");

  const organizationId = session.type === "dashboard" ? session.organizationId : undefined;
  const campaigns = await prisma.campaign.findMany({ where: { ...(organizationId ? { organizationId } : {}) }, orderBy: [{ createdAt: "desc" }, { name: "asc" }] });

  return (
    <DashboardShell title="الحملات الترويجية" description="إنشاء عروض دقيقة حسب نوع العميل أو النشاط، وتفعيلها أو إيقافها من مكان واحد.">
      <CampaignManager initialCampaigns={campaigns.map(toSafeCampaign)} />
    </DashboardShell>
  );
}
