import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { CampaignManager } from "@/components/dashboard/campaign-manager";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { toSafeCampaign } from "@/lib/campaigns/campaign-summary";
import { prisma } from "@/lib/db/prisma";

export default async function DashboardCampaignsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const campaigns = await prisma.campaign.findMany({ orderBy: [{ createdAt: "desc" }, { name: "asc" }] });

  return (
    <main className="min-h-screen bg-salon-mist px-5 py-8 text-salon-ink">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 border-b border-salon-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-bold text-salon-gold">لوحة الإدارة</Link>
            <h1 className="mt-2 text-3xl font-bold">الحملات الترويجية</h1>
          </div>
          <LogoutButton />
        </div>

        <CampaignManager initialCampaigns={campaigns.map(toSafeCampaign)} />
      </section>
    </main>
  );
}
