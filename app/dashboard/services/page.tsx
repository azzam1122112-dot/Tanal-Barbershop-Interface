import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { ServiceManager } from "@/components/dashboard/service-manager";
import { canAccessDashboard, canManageStaff } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeService } from "@/lib/services/service-summary";

export default async function DashboardServicesPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canManageStaff(session)) redirect("/dashboard");

  const organizationId = session.type === "dashboard" ? session.organizationId : undefined;
  const services = await prisma.service.findMany({
    where: { ...(organizationId ? { organizationId } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <DashboardShell title="الخدمات" description="إدارة قائمة الخدمات والأسعار وترتيب الظهور للموظفين أثناء تسجيل الزيارات.">
      <ServiceManager initialServices={services.map((service) => toSafeService(service, true))} />
    </DashboardShell>
  );
}
