import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardShell, Notice } from "@/components/dashboard/ui";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";

export default async function DashboardForbiddenPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  return (
    <DashboardShell
      title="هذه الصفحة خارج صلاحياتك"
      description="حسابك يعمل بصورة طبيعية، لكن هذه المهمة تحتاج دورًا إداريًا أعلى."
      actions={
        <Link href="/dashboard" className="dashboard-button">
          العودة لمركز المتابعة
        </Link>
      }
    >
      <Notice tone="warning" title="لم يتم تغيير أي بيانات" className="mt-6">
        إذا كنت تحتاج هذه المهمة ضمن عملك، راجع مالك المؤسسة أو مدير المؤسسة لتحديث الدور أو إسناد الفرع المناسب.
      </Notice>
    </DashboardShell>
  );
}
