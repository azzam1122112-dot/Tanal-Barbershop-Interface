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
    <main className="min-h-screen bg-salon-mist px-5 py-6 text-salon-ink">
      <section className="mx-auto max-w-md space-y-5">
        <Link href={`/barber/customers/${customer.id}`} className="text-sm font-bold text-salon-gold">العودة للعميل</Link>
        <div>
          <p className="text-sm font-bold text-salon-gold">تسجيل زيارة</p>
          <h1 className="mt-2 text-2xl font-bold">{customer.name}</h1>
          <p className="text-salon-charcoal">{customer.phone}</p>
        </div>
        <VisitForm customerId={customer.id} services={onlyActiveServices(services).map((service) => toSafeService(service))} />
      </section>
    </main>
  );
}
