import Link from "next/link";
import { redirect } from "next/navigation";
import { AppointmentCloseNote } from "@/components/barber/appointment-close-note";
import { findCloseableAppointment } from "@/lib/appointments/appointment-service";
import { canAccessBarberApp } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { onlyActiveServices, toSafeService } from "@/lib/services/service-summary";
import { VisitForm } from "@/components/barber/visit-form";
import { listProducts } from "@/lib/products/product-service";

export default async function NewVisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ appointment?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/barber/login");
  if (!canAccessBarberApp(session)) redirect("/dashboard");

  const { id } = await params;
  const { appointment: appointmentParam } = await searchParams;
  // مقيّد بمؤسسة الحلاق وفرعه: لا يُسجَّل عميل أو خدمة من مستأجر آخر.
  const [customer, services, products] = await Promise.all([
    prisma.customer.findFirst({
      where: { id, organizationId: session.organizationId },
      include: { loyaltyAccount: { select: { id: true } } },
    }),
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

  if (!customer) redirect("/barber");

  // الموعد يجب أن يخصّ هذا العميل بعينه: `customerId` جزء من الشرط، فرابطٌ
  // يحمل موعد عميل آخر لا يُعرض ولا يُقفل.
  const appointment = appointmentParam
    ? await findCloseableAppointment(prisma, {
        appointmentId: appointmentParam,
        organizationId: session.organizationId,
        salonId: session.salonId,
        barberId: session.barber.id,
        customerId: customer.id,
      })
    : null;

  return (
    // شاشة تسجيل الزيارة تبقى عمودًا واحدًا حتى على التابلت: النموذج تسلسل خطوات
    // (خدمات ← مبلغ ← معاينة)، وتوزيعه على عمودين يكسر ترتيب القراءة.
    <main className="barber-shell">
      <section className="mx-auto w-full max-w-md space-y-5 md:max-w-xl">
        <Link
          href={appointment ? "/barber#appointments" : `/barber/customers/${customer.id}`}
          className="barber-ghost-button inline-flex min-h-11 py-2 text-sm"
        >
          {appointment ? "العودة للمواعيد" : "العودة للعميل"}
        </Link>
        <div className="barber-card lux-edge p-5">
          <p className="text-xs font-bold tracking-[0.18em] text-salon-forest">تسجيل زيارة</p>
          <h1 className="mt-3 text-3xl font-bold text-salon-ink">{customer.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="font-semibold text-salon-charcoal/75">{customer.phone}</p>
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${customer.loyaltyAccount ? "border-violet-200 bg-violet-50 text-violet-700" : "border-salon-line bg-salon-mist text-salon-charcoal"}`}>
              {customer.loyaltyAccount ? "مشترك في الولاء" : "عملية بدون ولاء"}
            </span>
          </div>
          <div className="mt-4 rounded-2xl border border-salon-line bg-salon-pearl px-4 py-3 text-sm font-semibold text-salon-charcoal">
            اختر الخدمات، أدخل المبلغ، ثم اعرض المعاينة قبل التأكيد.
          </div>
        </div>
        <AppointmentCloseNote appointment={appointment} />
        <VisitForm
          appointmentId={appointment?.id ?? null}
          customerId={customer.id}
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
