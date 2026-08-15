import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { SalonsManager } from "@/components/dashboard/salons-manager";
import { TeamLoginLinks } from "@/components/dashboard/team-login-links";
import { canAccessDashboard, canManageOrganization } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { listSalons } from "@/lib/organizations/organization-service";
import { prisma } from "@/lib/db/prisma";

export default async function DashboardSalonsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canManageOrganization(session) || session.type !== "dashboard") redirect("/dashboard/forbidden");

  const [salons, organization] = await Promise.all([
    listSalons(prisma, session.organizationId),
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { slug: true, plan: { select: { name: true, maxSalons: true } } },
    }),
  ]);

  return (
    <DashboardShell title="فروع المؤسسة" description="أضف وأدِر صالونات مؤسستك، وشارك روابط الدخول مع فريقك.">
      {organization ? <TeamLoginLinks slug={organization.slug} /> : null}
      <SalonsManager
        initialSalons={salons}
        planName={organization?.plan?.name ?? "التجربة"}
        maxSalons={organization?.plan?.maxSalons ?? 1}
      />
    </DashboardShell>
  );
}
