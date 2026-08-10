import { redirect } from "next/navigation";
import { CashCustodyManager } from "@/components/dashboard/cash-custody-manager";
import { DashboardShell, Notice } from "@/components/dashboard/ui";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { effectiveSalonIds } from "@/lib/auth/salon-scope";
import { getCashCustodyDashboard } from "@/lib/cash-custody/cash-custody-service";
import { prisma } from "@/lib/db/prisma";

export default async function CashCustodyPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session) || session.type !== "dashboard") redirect("/barber");

  const data = await getCashCustodyDashboard(prisma, {
    organizationId: session.organizationId,
    salonIds: effectiveSalonIds(session),
  });

  return (
    <DashboardShell
      eyebrow="الرقابة النقدية · دفتر عهدة مستقل"
      title="عهدة الكاش والتحصيل"
      description="اعرف الكاش المتبقي لدى كل حلاق، وما انتقل إلى خزنة الفرع، دون تسجيل التحصيل كإيراد أو مصروف جديد."
    >
      <Notice title="التحصيل نقل عهدة فقط" tone="gold" className="mt-6">
        الإيراد يُثبت مرة واحدة عند دفع الزيارة. هذه الشاشة تنقل حيازة النقد بين الحلاق وخزنة الفرع، وكل خطأ يُعكس بحركة موثقة بدل حذف السجل.
      </Notice>
      <CashCustodyManager initialData={data} />
    </DashboardShell>
  );
}
