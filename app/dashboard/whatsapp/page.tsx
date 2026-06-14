import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
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

  const [templates, messages, customers, visits, campaigns, inactiveAudience, rewardAudience] = await Promise.all([
    getWhatsAppTemplates(prisma),
    getWhatsAppMessages(prisma),
    prisma.customer.findMany({
      include: { loyaltyAccount: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.visit.findMany({
      where: { status: "COMPLETED" },
      include: { customer: true },
      orderBy: { visitedAt: "desc" },
      take: 100,
    }),
    prisma.campaign.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    getInactiveWhatsAppAudience(prisma, 30),
    getRewardReadyWhatsAppAudience(prisma),
  ]);

  return (
    <main className="min-h-screen bg-salon-mist px-5 py-8 text-salon-ink">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 border-b border-salon-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-bold text-salon-gold">لوحة الإدارة</Link>
            <h1 className="mt-2 text-3xl font-bold">واتساب ورسائل العملاء</h1>
            <p className="mt-2 max-w-3xl text-sm text-salon-charcoal">
              جهز رسائل واتساب بروابط wa.me، ثم افتح واتساب وأرسل يدويًا. لا يوجد إرسال تلقائي داخل النظام.
            </p>
          </div>
          <LogoutButton />
        </div>

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
      </section>
    </main>
  );
}
