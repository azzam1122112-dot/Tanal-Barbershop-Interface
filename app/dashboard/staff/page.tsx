import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/ui";
import { StaffManager } from "@/components/dashboard/staff-manager";
import { canAccessDashboard, canManageStaff } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeAdminUser } from "@/lib/auth/sanitize";
import { staffWithSalonsInclude } from "@/lib/staff/staff-salon";

export default async function DashboardStaffPage() {
  const session = await getRequestSession();

  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canManageStaff(session) || session.type !== "dashboard") redirect("/dashboard");

  const [users, salons] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: session.organizationId, role: { in: ["OWNER", "ADMIN", "SUPERVISOR"] } },
      orderBy: [{ isActive: "desc" }, { role: "asc" }, { createdAt: "desc" }],
      include: staffWithSalonsInclude,
    }),
    prisma.salon.findMany({
      where: { organizationId: session.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <DashboardShell title="الموظفون والصلاحيات" description="إدارة حسابات مدراء النظام والمشرفين، وإسناد المشرفين إلى الفروع. يظهر هذا القسم للمدير فقط.">
      <StaffManager initialUsers={users.map((user) => toSafeAdminUser(user, true))} salons={salons} currentUserId={session.user.id} />
    </DashboardShell>
  );
}
