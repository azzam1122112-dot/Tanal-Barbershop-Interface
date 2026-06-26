import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { WhatsAppDashboard } from "@/components/dashboard/whatsapp-dashboard";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toCustomerDashboardRow } from "@/lib/customers/customer-summary";
import {
  getInactiveWhatsAppAudience,
  getRewardReadyWhatsAppAudience,
  getWhatsAppMessages,
  getWhatsAppTemplates,
} from "@/lib/whatsapp/whatsapp-service";

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; visitId?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  const params = await searchParams;

  const organizationId = session.type === "dashboard" ? session.organizationId : undefined;
  const orgFilter = organizationId ? { organizationId } : {};
  const [templates, messages, customers, visits, campaigns, inactiveAudience, rewardAudience] = await Promise.all([
    getWhatsAppTemplates(prisma, organizationId),
    getWhatsAppMessages(prisma, { organizationId }),
    prisma.customer.findMany({
      where: orgFilter,
      include: { loyaltyAccount: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.visit.findMany({
      where: { status: "COMPLETED", ...orgFilter },
      include: { customer: true },
      orderBy: { visitedAt: "desc" },
      take: 100,
    }),
    prisma.campaign.findMany({
      where: { isActive: true, ...orgFilter },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    getInactiveWhatsAppAudience(prisma, 30, organizationId),
    getRewardReadyWhatsAppAudience(prisma, organizationId),
  ]);

  return (
    <DashboardShell title="واتساب ورسائل العملاء" description="جهز رسائل واتساب بروابط wa.me، ثم افتح واتساب وأرسل يدويًا. لا يوجد إرسال تلقائي داخل النظام.">
        <WhatsAppDashboard
          initialTemplates={templates}
          initialMessages={messages}
          customers={customers.map(toCustomerDashboardRow)}
          visits={visits.map((visit) => ({
            id: visit.id,
            customerId: visit.customerId,
            label: `${visit.customer.name} - ${Number(visit.netAmount)} ريال - ${new Date(visit.visitedAt).toLocaleDateString("ar-SA")}`,
          }))}
          campaigns={campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))}
          inactiveAudience={inactiveAudience}
          rewardAudience={rewardAudience}
          prefillCustomerId={params.customerId}
          prefillVisitId={params.visitId}
        />
    </DashboardShell>
  );
}
