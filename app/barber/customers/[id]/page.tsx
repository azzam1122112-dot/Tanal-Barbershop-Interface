import { formatDate, formatMoney, formatNumber } from "@/lib/format";
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
    // مقيّد بمؤسسة الحلاق: لا يُفتح ملف عميل من مستأجر آخر بمعرفة معرّفه.
    prisma.customer.findFirst({
      where: { id, organizationId: session.organizationId },
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
    prisma.service.findMany({
      where: { organizationId: session.organizationId, salonId: session.salonId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.rewardRule.findMany({
      where: { organizationId: session.organizationId, isActive: true },
      orderBy: [{ requiredPoints: "asc" }],
    }),
  ]);

  if (!customer) redirect("/barber");

  const summary = toCustomerSummary({ ...customer, visits: customer.visits.slice(0, 1) });
  const activeServices = onlyActiveServices(services).map((service) => toSafeService(service));
  const availableRewards = summary.loyaltyEnabled
    ? rewardRules.filter((reward) => reward.requiredPoints <= summary.pointsBalance)
    : [];

  return (
    <main className="barber-shell">
      <section className="barber-container space-y-5">
        <Link href="/barber" className="barber-ghost-button inline-flex min-h-11 py-2 text-sm">العودة للبحث</Link>
        <div className="barber-card overflow-hidden">
          <div className="barber-card-head p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-salon-forest">ملف العميل</p>
                <h1 className="mt-2 text-3xl font-bold text-salon-ink">{summary.name}</h1>
                <p className="mt-1 font-semibold text-salon-charcoal/75">{summary.phone}</p>
              </div>
              <div className={`rounded-2xl border px-4 py-3 text-center ${summary.loyaltyEnabled ? "border-salon-gold/40 bg-white" : "border-salon-line bg-salon-mist"}`}>
                <p className="text-xs font-bold text-salon-charcoal/65">{summary.loyaltyEnabled ? "النقاط" : "الولاء"}</p>
                <p className={`${summary.loyaltyEnabled ? "text-2xl" : "mt-1 text-xs"} font-black text-salon-forest`}>
                  {summary.loyaltyEnabled ? formatNumber(summary.pointsBalance) : "غير مشترك"}
                </p>
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 p-4 text-sm">
            <InfoTile label="عدد الزيارات" value={formatNumber(summary.visitsCount)} />
            <InfoTile label="آخر زيارة" value={summary.lastVisitAt ? formatDate(summary.lastVisitAt) : "-"} />
            <InfoTile label="آخر حلاق" value={summary.lastBarberName ?? "-"} />
            <InfoTile label="آخر خدمات" value={summary.lastServices.join("، ") || "-"} />
          </dl>
        </div>

        {/* بطاقات الملف تتوزّع على عمودين من التابلت فما فوق بدل عمود طويل يحتاج تمريرًا. */}
        <div className="barber-grid">
        <SectionCard title="آخر 5 زيارات">
          <div className="mt-3 space-y-3">
            {customer.visits.map((visit) => (
              <div key={visit.id} className="rounded-2xl border border-salon-line bg-salon-pearl p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">{formatDate(visit.visitedAt)}</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-salon-forest">{formatMoney(Number(visit.netAmount))}</span>
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
                <span className="font-black text-salon-forest">{formatMoney(service.defaultPrice)}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {summary.loyaltyEnabled ? (
          <SectionCard title="المكافآت المتاحة">
            <p className="mt-2 text-sm font-semibold text-salon-charcoal">رصيد النقاط: {formatNumber(summary.pointsBalance)}</p>
            <div className="mt-3 grid gap-2">
              {availableRewards.map((reward) => (
                <div key={reward.id} className="rounded-2xl border border-salon-gold/30 bg-salon-gold/10 px-3 py-3 text-sm font-bold">
                  خصم {formatMoney(Number(reward.discountAmount))} مقابل {formatNumber(reward.requiredPoints)} نقطة
                </div>
              ))}
              {availableRewards.length === 0 ? <p className="rounded-2xl bg-salon-mist py-4 text-center text-sm font-semibold text-salon-charcoal">لا توجد مكافآت متاحة حاليًا</p> : null}
            </div>
          </SectionCard>
        ) : (
          <SectionCard title="برنامج الولاء">
            <p className="mt-2 rounded-2xl border border-salon-line bg-salon-mist px-4 py-4 text-sm font-semibold leading-7 text-salon-charcoal">
              غير مشترك في الولاء. زياراته وفواتيره تُسجَّل بصورة طبيعية دون نقاط.
              {/* لا زر تسجيل هنا ولا في أي شاشة حلاق: العضوية يفتحها العميل
                  بنفسه من رمز الصالون بحساب بريده موثَّق. */}
              <span className="mt-2 block text-xs font-semibold text-salon-charcoal/70">
                للانضمام يمسح العميل رمز الصالون المعلَّق ويسجّل نفسه — لا يُسجَّل أحد نيابة عنه.
              </span>
            </p>
          </SectionCard>
        )}

        <SectionCard title="مكافآت الإدارة">
          <div className="mt-3 grid gap-2">
            {customer.managerRewards.map((reward) => (
              <div key={reward.id} className="rounded-2xl border border-salon-gold/30 bg-salon-gold/10 px-3 py-3 text-sm font-bold">
                <p>{reward.title} - خصم {Number(reward.discountAmount)} ريال</p>
                {reward.description ? <p className="mt-1 text-xs font-semibold text-salon-charcoal">{reward.description}</p> : null}
                {reward.expiresAt ? <p className="mt-1 text-xs font-semibold text-salon-charcoal">تنتهي في {formatDate(reward.expiresAt)}</p> : null}
              </div>
            ))}
            {customer.managerRewards.length === 0 ? <p className="rounded-2xl bg-salon-mist py-4 text-center text-sm font-semibold text-salon-charcoal">لا توجد مكافآت إدارية متاحة</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="حملات متاحة">
          <p className="mt-2 text-sm leading-6 text-salon-charcoal">قد تظهر حملات متاحة عند تسجيل الزيارة حسب المبلغ والخدمات وحالة العميل.</p>
        </SectionCard>

        {/* حُذف «مشاركة رابط صفحة العميل» من شاشة الحلاق. الرابط مفتاحٌ يفتح سجل
            زيارات العميل ورصيده بلا كلمة مرور، فإصداره بيد الحلاق يضع بيانات
            العميل تحت تصرّف غيره — وهو عين ما مُنع من أجله التسجيل نيابةً عنه.
            العميل يفتح صفحته بحسابه الموثَّق من `/account/loyalty`، والاسترجاع
            الاستثنائي يبقى للإدارة وحدها في لوحة العملاء. */}
        </div>
      </section>
      {/* شريط الإجراء الأساسي: ثابت أسفل الشاشة ليبقى «تسجيل زيارة» على بُعد لمسة
          مهما طال الملف. z-40 يبقيه تحت شريط التطبيق (z-50) — وحين ينقطع الاتصال
          فتغطيته صحيحة: لا زيارة تُسجَّل بلا شبكة أصلًا. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-salon-line bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(23,19,15,0.08)]">
        <div className="barber-container grid grid-cols-[1fr_auto] gap-2">
          <Link href={`/barber/customers/${summary.id}/visits/new`} className="barber-gold-button h-14 py-4 text-center text-lg">
            تسجيل زيارة جديدة
          </Link>
          <Link href="/barber" className="barber-ghost-button h-14 min-w-[7rem] py-4 text-center">
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
      <dd className="mt-1 break-words text-sm font-bold">{value}</dd>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="barber-card p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </div>
  );
}
