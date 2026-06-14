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
    <main className="min-h-screen bg-[linear-gradient(180deg,#17130f_0%,#24211d_190px,#f6f3ee_191px)] px-5 py-6 text-salon-ink">
      <section className="mx-auto max-w-md space-y-5">
        <Link href={`/barber/customers/${customer.id}`} className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-salon-gold backdrop-blur">العودة للعميل</Link>
        <div className="rounded-[1.75rem] border border-white/10 bg-white/10 p-5 text-white shadow-2xl shadow-black/20 backdrop-blur">
          <p className="text-xs font-black tracking-[0.18em] text-salon-gold">تسجيل زيارة</p>
          <h1 className="mt-3 text-3xl font-black">{customer.name}</h1>
          <p className="mt-1 font-semibold text-white/70">{customer.phone}</p>
          <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white/75">
            اختر الخدمات، أدخل المبلغ، ثم اعرض المعاينة قبل التأكيد.
          </div>
        </div>
        <VisitForm customerId={customer.id} services={onlyActiveServices(services).map((service) => toSafeService(service))} />
      </section>
    </main>
  );
}
