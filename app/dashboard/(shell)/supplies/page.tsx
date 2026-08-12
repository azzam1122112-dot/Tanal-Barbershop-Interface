import { redirect } from "next/navigation";
import { DashboardShell, Notice } from "@/components/dashboard/ui";
import { SuppliesManager } from "@/components/dashboard/supplies-manager";
import { canAccessDashboard, canManageProducts } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { listSupplyItems } from "@/lib/supplies/supply-service";

export default async function SuppliesPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  if (!canManageProducts(session)) redirect("/dashboard/forbidden");
  if (session.type !== "dashboard") redirect("/dashboard");

  const { organizationId, salonIds, activeSalonId } = dashboardScope(session);
  if (!organizationId) redirect("/dashboard");

  const [items, salons] = await Promise.all([
    listSupplyItems(prisma, { organizationId, salonIds }),
    prisma.salon.findMany({
      // المشرف يضيف لفروعه المسندة فقط.
      where: { organizationId, isActive: true, ...(salonIds ? { id: { in: salonIds } } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <DashboardShell
      title="المستلزمات التشغيلية"
      description="ما يُستهلك في العمل ولا يُباع للعميل: أمواس، رغوة، مناشف. قناة بلاغ من الحلاق إلى الإدارة بلا أي أثر مالي."
    >
      {salons.length === 0 ? (
        <Notice tone="warning" className="mt-6" title="لا يوجد فرع نشط">
          أضف فرعًا نشطًا قبل تسجيل المستلزمات.
        </Notice>
      ) : (
        <SuppliesManager
          initialItems={items}
          salons={salons}
          defaultSalonId={activeSalonId ?? salons[0]?.id ?? null}
        />
      )}
    </DashboardShell>
  );
}
