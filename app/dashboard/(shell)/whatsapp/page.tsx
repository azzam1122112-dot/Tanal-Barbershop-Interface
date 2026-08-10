import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { WhatsAppDashboard } from "@/components/dashboard/whatsapp-dashboard";
import { WhatsAppSafetyCenter } from "@/components/dashboard/whatsapp-safety-center";
import { canAccessDashboard, canOperateLoyalty } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toCustomerDashboardRow } from "@/lib/customers/customer-summary";
import { formatDate } from "@/lib/format";
import {
  getInactiveWhatsAppAudience,
  getRewardReadyWhatsAppAudience,
  getWhatsAppMessages,
  getWhatsAppTemplates,
} from "@/lib/whatsapp/whatsapp-service";
import { getWhatsAppSafetyOverview } from "@/lib/whatsapp/whatsapp-safety";

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; visitId?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canOperateLoyalty(session)) redirect("/dashboard");
  const params = await searchParams;

  const organizationId = session.type === "dashboard" ? session.organizationId : undefined;
  if (!organizationId) redirect("/dashboard");
  const orgFilter = organizationId ? { organizationId } : {};
  const [templates, messages, customers, visits, campaigns, inactiveAudience, rewardAudience, safetyOverview] = await Promise.all([
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
    getWhatsAppSafetyOverview(prisma, organizationId),
  ]);

  return (
    <DashboardShell title="واتساب ورسائل العملاء" description="تواصل يدوي محمي بالموافقات وفترات التهدئة والحدود الوقائية قبل فتح واتساب.">
        <div className="mt-8"><WhatsAppSafetyCenter initialOverview={safetyOverview} /></div>
        <WhatsAppDashboard
          initialTemplates={templates}
          initialMessages={messages}
          customers={customers.map(toCustomerDashboardRow)}
        visits={visits.flatMap((visit) => visit.customerId && visit.customer ? [{
            id: visit.id,
            customerId: visit.customerId,
            label: `${visit.customer.name} - ${Number(visit.netAmount)} ريال - ${formatDate(visit.visitedAt)}`,
          }] : [])}
          campaigns={campaigns.map((campaign) => ({ id: campaign.id, name: campaign.name }))}
          inactiveAudience={inactiveAudience}
          rewardAudience={rewardAudience}
          prefillCustomerId={params.customerId}
          prefillVisitId={params.visitId}
        />
    </DashboardShell>
  );
}
