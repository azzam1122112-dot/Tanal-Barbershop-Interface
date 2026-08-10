import Link from "next/link";
import { redirect } from "next/navigation";
import { VisitForm } from "@/components/barber/visit-form";
import { canAccessBarberApp } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { getOpenCashSession } from "@/lib/cash-sessions/cash-session-service";
import { prisma } from "@/lib/db/prisma";
import { listProducts } from "@/lib/products/product-service";
import { onlyActiveServices, toSafeService } from "@/lib/services/service-summary";

export default async function NewCashierVisitPage() {
  const session = await getRequestSession();
  if (!session) redirect("/barber/login");
  if (!canAccessBarberApp(session)) redirect("/dashboard");

  const [cashSession, services, products] = await Promise.all([
    getOpenCashSession(prisma, session.barber.id),
    prisma.service.findMany({
      where: { organizationId: session.organizationId, salonId: session.salonId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    listProducts(prisma, {
      organizationId: session.organizationId,
      salonIds: [session.salonId],
      onlyActive: true,
    }),
  ]);

  if (!cashSession) redirect("/barber");

  return (
    <main className="barber-shell">
      <section className="mx-auto w-full max-w-md space-y-5 md:max-w-xl">
        <Link href="/barber" className="barber-ghost-button inline-flex min-h-11 py-2 text-sm">العودة للصندوق</Link>
        <header className="barber-card lux-edge p-5">
          <p className="lux-eyebrow">نقطة البيع · عملية جديدة</p>
          <h1 className="mt-3 text-3xl font-bold text-salon-ink">اختر ما تم تقديمه</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-salon-charcoal/70">
            ابدأ بالخدمات. قبل الدفع يمكنك ربط عضو الولاء أو الاستمرار كعميل زائر بلا بيانات.
          </p>
        </header>
        <VisitForm
          customerId={null}
          services={onlyActiveServices(services).map((service) => toSafeService(service))}
          products={products
            .filter((product) => product.stockQuantity > 0)
            .map((product) => ({
              id: product.id,
              name: product.name,
              price: product.price,
              stockQuantity: product.stockQuantity,
            }))}
        />
      </section>
    </main>
  );
}
