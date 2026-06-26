import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { SalonsManager } from "@/components/dashboard/salons-manager";
import { canAccessDashboard, canManageOrganization } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { listSalons } from "@/lib/organizations/organization-service";
import { prisma } from "@/lib/db/prisma";

export default async function DashboardSalonsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canManageOrganization(session) || session.type !== "dashboard") redirect("/dashboard");

  const salons = await listSalons(prisma, session.organizationId);

  return (
    <DashboardShell title="فروع المؤسسة" description="أضف وأدِر صالونات مؤسستك. يظهر هذا القسم لمالك المؤسسة فقط.">
      <SalonsManager initialSalons={salons} />
    </DashboardShell>
  );
}
