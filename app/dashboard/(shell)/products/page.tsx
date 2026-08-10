import { redirect } from "next/navigation";
import { DashboardShell, Notice } from "@/components/dashboard/ui";
import { ProductsManager } from "@/components/dashboard/products-manager";
import { canAccessDashboard, canManageStaff } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { listProducts } from "@/lib/products/product-service";

export default async function ProductsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  // الكتالوج والمخزون من صلاحيات المالك/المدير مثل كتالوج الخدمات.
  if (!canManageStaff(session)) redirect("/dashboard/forbidden");
  if (session.type !== "dashboard") redirect("/dashboard");

  const { organizationId, salonIds, activeSalonId } = dashboardScope(session);
  if (!organizationId) redirect("/dashboard");

  const [products, salons] = await Promise.all([
    listProducts(prisma, { organizationId, salonIds }),
    prisma.salon.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <DashboardShell
      title="المنتجات والمخزون"
      description="كتالوج المنتجات المعروضة للبيع مع الزيارة، ورصيد المخزون وحركاته."
    >
      {salons.length === 0 ? (
        <Notice tone="warning" className="mt-6" title="لا يوجد فرع نشط">
          أضف فرعًا نشطًا قبل إنشاء المنتجات.
        </Notice>
      ) : (
        <ProductsManager
          initialProducts={products}
          salons={salons}
          defaultSalonId={activeSalonId ?? salons[0]?.id ?? null}
        />
      )}
    </DashboardShell>
  );
}
