import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessBarberApp } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { onlyActiveServices, toSafeService } from "@/lib/services/service-summary";
import { VisitForm } from "@/components/barber/visit-form";

export default async function NewVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession();
  if (!session) redirect("/barber/login");
  if (!canAccessBarberApp(session)) redirect("/dashboard");

  const { id } = await params;
  const [customer, services] = await Promise.all([
    prisma.customer.findUnique({ where: { id } }),
    prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  if (!customer) redirect("/barber");

  return (
    <main className="barber-shell px-5 py-6">
      <section className="barber-container space-y-5">
        <Link href={`/barber/customers/${customer.id}`} className="barber-ghost-button inline-flex py-2 text-sm">العودة للعميل</Link>
        <div className="rounded-3xl border border-salon-line bg-white p-5 shadow-sm shadow-salon-ink/5">
          <p className="text-xs font-black tracking-[0.18em] text-salon-forest">تسجيل زيارة</p>
          <h1 className="mt-3 text-3xl font-black text-salon-ink">{customer.name}</h1>
          <p className="mt-1 font-semibold text-salon-charcoal/75">{customer.phone}</p>
          <div className="mt-4 rounded-2xl border border-salon-line bg-salon-pearl px-4 py-3 text-sm font-semibold text-salon-charcoal">
            اختر الخدمات، أدخل المبلغ، ثم اعرض المعاينة قبل التأكيد.
          </div>
        </div>
        <VisitForm customerId={customer.id} services={onlyActiveServices(services).map((service) => toSafeService(service))} />
      </section>
    </main>
  );
}
