import { redirect } from "next/navigation";
import { DashboardShell, Notice } from "@/components/dashboard/ui";
import { ProductsManager } from "@/components/dashboard/products-manager";
import { canAccessDashboard, canManageProducts } from "@/lib/auth/access";
import { dashboardScope } from "@/lib/auth/salon-scope";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { listProducts } from "@/lib/products/product-service";
import { listStockReports } from "@/lib/products/stock-report-service";
import { StockReportsInbox } from "@/components/dashboard/stock-reports-inbox";

export default async function ProductsPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");
  // المخزون شأن الفرع: المشرف يدخل ضمن فروعه المسندة، والنطاق يفرضه
  // `dashboardScope` في كل استعلام لا حجب الشاشة.
  if (!canManageProducts(session)) redirect("/dashboard/forbidden");
  if (session.type !== "dashboard") redirect("/dashboard");

  const { organizationId, salonIds, activeSalonId } = dashboardScope(session);
  if (!organizationId) redirect("/dashboard");

  const [products, salons, stockReports] = await Promise.all([
    listProducts(prisma, { organizationId, salonIds }),
    prisma.salon.findMany({
      // المشرف لا يرى أسماء فروع غيره في قائمة الاختيار، ولا ينشئ منتجًا فيها.
      where: { organizationId, isActive: true, ...(salonIds ? { id: { in: salonIds } } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    listStockReports(prisma, { organizationId, salonIds, take: 40 }),
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
        <>
          <ProductsManager
            initialProducts={products}
            salons={salons}
            defaultSalonId={activeSalonId ?? salons[0]?.id ?? null}
          />
          <StockReportsInbox initialReports={stockReports} />
        </>
      )}
    </DashboardShell>
  );
}
