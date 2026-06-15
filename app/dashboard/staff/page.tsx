import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { StaffManager } from "@/components/dashboard/staff-manager";
import { canAccessDashboard, canManageStaff } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeAdminUser } from "@/lib/auth/sanitize";

export default async function DashboardStaffPage() {
  const session = await getRequestSession();

  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canManageStaff(session) || session.type !== "dashboard") redirect("/dashboard");

  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPERVISOR"] } },
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { createdAt: "desc" }],
  });

  return (
    <DashboardShell title="الموظفون والصلاحيات" description="إدارة حسابات مدراء النظام والمشرفين. يظهر هذا القسم للمدير فقط.">
      <StaffManager initialUsers={users.map((user) => toSafeAdminUser(user, true))} currentUserId={session.user.id} />
    </DashboardShell>
  );
}
