import Link from "next/link";
import type { ReactNode } from "react";
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
  const now = new Date();
  const [customer, services, rewardRules] = await Promise.all([
    prisma.customer.findUnique({
      where: { id },
      include: {
        loyaltyAccount: true,
        managerRewards: {
          where: {
            redeemedAt: null,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
          },
          orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
        },
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
    <main className="barber-shell pb-28 pt-6">
      <section className="barber-container space-y-5">
        <Link href="/barber" className="barber-ghost-button inline-flex py-2 text-sm">العودة للبحث</Link>
        <div className="overflow-hidden rounded-3xl border border-salon-line bg-white shadow-sm shadow-salon-ink/5">
          <div className="border-b border-salon-line bg-salon-pearl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.18em] text-salon-forest">ملف العميل</p>
                <h1 className="mt-2 text-3xl font-black text-salon-ink">{summary.name}</h1>
                <p className="mt-1 font-semibold text-salon-charcoal/75">{summary.phone}</p>
              </div>
              <div className="rounded-2xl border border-salon-gold/40 bg-white px-4 py-3 text-center">
                <p className="text-xs font-bold text-salon-charcoal/65">النقاط</p>
                <p className="text-2xl font-black text-salon-forest">{summary.pointsBalance}</p>
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 p-4 text-sm">
            <InfoTile label="عدد الزيارات" value={summary.visitsCount.toString()} />
            <InfoTile label="آخر زيارة" value={summary.lastVisitAt ? new Date(summary.lastVisitAt).toLocaleDateString("ar-SA") : "-"} />
            <InfoTile label="آخر حلاق" value={summary.lastBarberName ?? "-"} />
            <InfoTile label="آخر خدمات" value={summary.lastServices.join("، ") || "-"} />
          </dl>
        </div>

        <SectionCard title="آخر 5 زيارات">
          <div className="mt-3 space-y-3">
            {customer.visits.map((visit) => (
              <div key={visit.id} className="rounded-2xl border border-salon-line bg-salon-pearl p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black">{visit.visitedAt.toLocaleDateString("ar-SA")}</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-salon-forest">{Number(visit.netAmount)} ريال</span>
                </div>
                <p className="mt-1 font-semibold text-salon-charcoal/75">{visit.barber.name} - {visit.paymentMethod === "CASH" ? "كاش" : "شبكة"}</p>
                <p className="mt-1 text-salon-charcoal">{visit.services.map((service) => service.serviceName).join("، ") || "-"}</p>
              </div>
            ))}
            {customer.visits.length === 0 ? <p className="rounded-2xl border border-dashed border-salon-line bg-salon-pearl py-5 text-center text-sm font-semibold text-salon-charcoal">لا توجد زيارات بعد</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="الخدمات النشطة">
          <div className="mt-3 grid gap-2">
            {activeServices.map((service) => (
              <div key={service.id} className="flex justify-between rounded-2xl border border-salon-line bg-salon-pearl px-3 py-3 text-sm">
                <span className="font-bold">{service.name}</span>
                <span className="font-black text-salon-forest">{service.defaultPrice} ريال</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="المكافآت المتاحة">
          <p className="mt-2 text-sm font-semibold text-salon-charcoal">رصيد النقاط: {summary.pointsBalance}</p>
          <div className="mt-3 grid gap-2">
            {availableRewards.map((reward) => (
              <div key={reward.id} className="rounded-2xl border border-salon-gold/30 bg-salon-gold/10 px-3 py-3 text-sm font-bold">
                خصم {Number(reward.discountAmount)} ريال مقابل {reward.requiredPoints} نقطة
              </div>
            ))}
            {availableRewards.length === 0 ? <p className="rounded-2xl bg-salon-mist py-4 text-center text-sm font-semibold text-salon-charcoal">لا توجد مكافآت متاحة حاليًا</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="مكافآت الإدارة">
          <div className="mt-3 grid gap-2">
            {customer.managerRewards.map((reward) => (
              <div key={reward.id} className="rounded-2xl border border-salon-gold/30 bg-salon-gold/10 px-3 py-3 text-sm font-bold">
                <p>{reward.title} - خصم {Number(reward.discountAmount)} ريال</p>
                {reward.description ? <p className="mt-1 text-xs font-semibold text-salon-charcoal">{reward.description}</p> : null}
                {reward.expiresAt ? <p className="mt-1 text-xs font-semibold text-salon-charcoal">تنتهي في {reward.expiresAt.toLocaleDateString("ar-SA")}</p> : null}
              </div>
            ))}
            {customer.managerRewards.length === 0 ? <p className="rounded-2xl bg-salon-mist py-4 text-center text-sm font-semibold text-salon-charcoal">لا توجد مكافآت إدارية متاحة</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="حملات متاحة">
          <p className="mt-2 text-sm leading-6 text-salon-charcoal">قد تظهر حملات متاحة عند تسجيل الزيارة حسب المبلغ والخدمات وحالة العميل.</p>
        </SectionCard>
      </section>
      <div className="fixed inset-x-0 bottom-0 border-t border-salon-line bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(23,19,15,0.08)]">
        <div className="mx-auto grid max-w-md grid-cols-[1fr_120px] gap-2">
          <Link href={`/barber/customers/${summary.id}/visits/new`} className="barber-gold-button h-14 py-4 text-center text-lg">
            تسجيل زيارة جديدة
          </Link>
          <Link href="/barber" className="barber-ghost-button h-14 py-4 text-center">
            بحث
          </Link>
        </div>
      </div>
    </main>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-salon-line bg-salon-pearl p-3">
      <dt className="text-xs font-bold text-salon-charcoal/65">{label}</dt>
      <dd className="mt-1 break-words text-sm font-black">{value}</dd>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="barber-card p-5">
      <h2 className="text-lg font-black">{title}</h2>
      {children}
    </div>
  );
}
