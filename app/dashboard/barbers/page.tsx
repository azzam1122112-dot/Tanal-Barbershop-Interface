import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { BarberManager } from "@/components/dashboard/barber-manager";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeBarber } from "@/lib/auth/sanitize";

export default async function DashboardBarbersPage() {
  const session = await getRequestSession();

  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const barbers = await prisma.barber.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  return (
    <DashboardShell title="إدارة الحلاقين" description="إضافة الحلاقين، تحديث بياناتهم، وتعطيل الحسابات أو تغيير رموز الدخول بسرعة.">
      <BarberManager initialBarbers={barbers.map((barber) => toSafeBarber(barber, true))} />
    </DashboardShell>
  );
}
