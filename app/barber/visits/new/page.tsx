import Link from "next/link";
import { redirect } from "next/navigation";
import { AppointmentCloseNote } from "@/components/barber/appointment-close-note";
import { VisitForm } from "@/components/barber/visit-form";
import { findCloseableAppointment } from "@/lib/appointments/appointment-service";
import { canAccessBarberApp } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { getOpenCashSession } from "@/lib/cash-sessions/cash-session-service";
import { prisma } from "@/lib/db/prisma";
import { listProducts } from "@/lib/products/product-service";
import { onlyActiveServices, toSafeService } from "@/lib/services/service-summary";

export default async function NewCashierVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/barber/login");
  if (!canAccessBarberApp(session)) redirect("/dashboard");

  const { appointment: appointmentParam } = await searchParams;

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

  // موعد زائر بلا عميل مسجّل. الشرط نفسه الذي سيحكم القفل وقت التأكيد، فما
  // يُعرض هنا هو ما يُقفل هناك بالضبط.
  const appointment = appointmentParam
    ? await findCloseableAppointment(prisma, {
        appointmentId: appointmentParam,
        organizationId: session.organizationId,
        salonId: session.salonId,
        barberId: session.barber.id,
        customerId: null,
      })
    : null;

  return (
    <main className="barber-shell">
      <section className="mx-auto w-full max-w-md space-y-5 md:max-w-xl">
        <Link href={appointment ? "/barber#appointments" : "/barber"} className="barber-ghost-button inline-flex min-h-11 py-2 text-sm">
          {appointment ? "العودة للمواعيد" : "العودة للصندوق"}
        </Link>
        <header className="barber-card lux-edge p-5">
          <p className="lux-eyebrow">نقطة البيع · عملية جديدة</p>
          <h1 className="mt-3 text-3xl font-bold text-salon-ink">اختر ما تم تقديمه</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-salon-charcoal/70">
            ابدأ بالخدمات. قبل الدفع يمكنك ربط عضو الولاء أو الاستمرار كعميل زائر بلا بيانات.
          </p>
        </header>
        <AppointmentCloseNote appointment={appointment} />
        <VisitForm
          appointmentId={appointment?.id ?? null}
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
