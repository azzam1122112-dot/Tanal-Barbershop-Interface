import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { BarberManager } from "@/components/dashboard/barber-manager";
import { canAccessDashboard, canManageStaff } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeBarber } from "@/lib/auth/sanitize";

export default async function DashboardBarbersPage() {
  const session = await getRequestSession();

  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canManageStaff(session)) redirect("/dashboard");

  const organizationId = session.type === "dashboard" ? session.organizationId : undefined;
  const activeSalonId = session.type === "dashboard" ? session.salonId : null;
  const [barbers, salons] = await Promise.all([
    prisma.barber.findMany({
      where: { ...(organizationId ? { organizationId } : {}), ...(activeSalonId ? { salonId: activeSalonId } : {}) },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    }),
    organizationId
      ? prisma.salon.findMany({
          where: { organizationId, isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <DashboardShell title="إدارة الحلاقين" description="إضافة الحلاقين، تحديث بياناتهم، وتعطيل الحسابات أو تغيير رموز الدخول بسرعة.">
      <BarberManager
        initialBarbers={barbers.map((barber) => toSafeBarber(barber, true))}
        salons={salons}
        defaultSalonId={activeSalonId}
      />
    </DashboardShell>
  );
}
