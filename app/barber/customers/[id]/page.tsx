import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessBarberApp } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toCustomerSummary } from "@/lib/customers/customer-summary";
import { onlyActiveServices, toSafeService } from "@/lib/services/service-summary";

export default async function BarberCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession();
  if (!session) redirect("/barber/login");
  if (!canAccessBarberApp(session)) redirect("/dashboard");

  const { id } = await params;
  const [customer, services, rewardRules] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        loyaltyAccount: true,
        visits: {
          orderBy: { visitedAt: "desc" },
          take: 5,
          include: { barber: true, services: true },
        },
      },
    }),
    prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.rewardRule.findMany({ where: { isActive: true }, orderBy: [{ requiredPoints: "asc" }] }),
  ]);

  if (!customer) redirect("/barber");

  const summary = toCustomerSummary({ ...customer, visits: customer.visits.slice(0, 1) });
  const activeServices = onlyActiveServices(services).map((service) => toSafeService(service));
  const availableRewards = rewardRules.filter((reward) => reward.requiredPoints <= summary.pointsBalance);

  return (
    <main className="min-h-screen bg-salon-mist px-4 pb-28 pt-6 text-salon-ink">
      <section className="mx-auto max-w-md space-y-5">
        <Link href="/barber" className="text-sm font-bold text-salon-gold">العودة للبحث</Link>
        <div className="rounded-lg border border-salon-line bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{summary.name}</h1>
              <p className="mt-1 text-salon-charcoal">{summary.phone}</p>
            </div>
            <div className="rounded-lg bg-salon-mist px-3 py-2 text-center">
              <p className="text-xs text-salon-charcoal">النقاط</p>
              <p className="text-xl font-bold">{summary.pointsBalance}</p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-salon-charcoal">عدد الزيارات</dt><dd className="font-bold">{summary.visitsCount}</dd></div>
            <div><dt className="text-salon-charcoal">آخر زيارة</dt><dd className="font-bold">{summary.lastVisitAt ? new Date(summary.lastVisitAt).toLocaleDateString("ar-SA") : "-"}</dd></div>
            <div><dt className="text-salon-charcoal">آخر حلاق</dt><dd className="font-bold">{summary.lastBarberName ?? "-"}</dd></div>
            <div><dt className="text-salon-charcoal">آخر خدمات</dt><dd className="font-bold">{summary.lastServices.join("، ") || "-"}</dd></div>
          </dl>
        </div>

        <div className="rounded-lg border border-salon-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">آخر 5 زيارات</h2>
          <div className="mt-3 space-y-3">
            {customer.visits.map((visit) => (
              <div key={visit.id} className="rounded-md border border-salon-line p-3 text-sm">
                <p className="font-bold">{visit.visitedAt.toLocaleDateString("ar-SA")} - {visit.barber.name}</p>
                <p className="text-salon-charcoal">{visit.services.map((service) => service.serviceName).join("، ") || "-"}</p>
                <p className="mt-1">{Number(visit.netAmount)} ريال - {visit.paymentMethod === "CASH" ? "كاش" : "شبكة"}</p>
              </div>
            ))}
            {customer.visits.length === 0 ? <p className="text-sm text-salon-charcoal">لا توجد زيارات بعد</p> : null}
          </div>
        </div>

        <div className="rounded-lg border border-salon-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">الخدمات النشطة</h2>
          <div className="mt-3 grid gap-2">
            {activeServices.map((service) => (
              <div key={service.id} className="flex justify-between rounded-md bg-salon-mist px-3 py-2 text-sm">
                <span>{service.name}</span>
                <span className="font-bold">{service.defaultPrice} ريال</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-salon-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">المكافآت المتاحة</h2>
          <p className="mt-2 text-sm text-salon-charcoal">رصيد النقاط: {summary.pointsBalance}</p>
          <div className="mt-3 grid gap-2">
            {availableRewards.map((reward) => (
              <div key={reward.id} className="rounded-md bg-salon-mist px-3 py-2 text-sm">
                خصم {Number(reward.discountAmount)} ريال مقابل {reward.requiredPoints} نقطة
              </div>
            ))}
            {availableRewards.length === 0 ? <p className="text-sm text-salon-charcoal">لا توجد مكافآت متاحة حاليًا</p> : null}
          </div>
        </div>

        <div className="rounded-lg border border-salon-line bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">حملات متاحة</h2>
          <p className="mt-2 text-sm text-salon-charcoal">قد تظهر حملات متاحة عند تسجيل الزيارة حسب المبلغ والخدمات وحالة العميل.</p>
        </div>
      </section>
      <div className="fixed inset-x-0 bottom-0 border-t border-salon-line bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-[1fr_120px] gap-2">
          <Link href={`/barber/customers/${summary.id}/visits/new`} className="h-14 rounded-md bg-salon-gold px-4 py-4 text-center text-lg font-bold text-salon-ink">
            تسجيل زيارة جديدة
          </Link>
          <Link href="/barber" className="h-14 rounded-md border border-salon-line px-4 py-4 text-center font-bold text-salon-charcoal">
            بحث
          </Link>
        </div>
      </div>
    </main>
  );
}
