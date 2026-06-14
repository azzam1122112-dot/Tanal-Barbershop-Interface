import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import {
  getBarberPerformanceReport,
  getCustomerReport,
  getDiscountReport,
  getPresetRange,
  getRevenueReport,
  getServiceReport,
  type ReportFilters,
} from "@/lib/reports/dashboard-reports";

export default async function DashboardReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; barberId?: string; paymentMethod?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const params = await searchParams;
  const presetRange = getPresetRange(params.preset);
  const filters: ReportFilters = {
    from: params.from ? startOfDay(params.from) : presetRange.from,
    to: params.to ? endExclusive(params.to) : presetRange.to,
    barberId: params.barberId,
    paymentMethod: params.paymentMethod === "CASH" || params.paymentMethod === "NETWORK" ? params.paymentMethod : undefined,
  };

  const [barbers, revenue, barberPerformance, services, customers, discounts] = await Promise.all([
    prisma.barber.findMany({ orderBy: { name: "asc" } }),
    getRevenueReport(prisma, filters),
    getBarberPerformanceReport(prisma, filters),
    getServiceReport(prisma, filters),
    getCustomerReport(prisma, filters),
    getDiscountReport(prisma, filters),
  ]);

  return (
    <main className="min-h-screen bg-salon-mist px-5 py-8 text-salon-ink">
      <section className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 border-b border-salon-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-bold text-salon-gold">لوحة الإدارة</Link>
            <h1 className="mt-2 text-3xl font-bold">التقارير المالية والتشغيلية</h1>
          </div>
          <LogoutButton />
        </div>

        <form className="mt-6 grid gap-3 rounded-lg border border-salon-line bg-white p-4 lg:grid-cols-[150px_150px_150px_1fr_150px_120px]">
          <select name="preset" defaultValue={params.preset ?? "today"} className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="today">اليوم</option>
            <option value="yesterday">أمس</option>
            <option value="last7">آخر 7 أيام</option>
            <option value="month">هذا الشهر</option>
            <option value="custom">فترة مخصصة</option>
          </select>
          <input name="from" type="date" defaultValue={params.from ?? ""} className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
          <input name="to" type="date" defaultValue={params.to ?? ""} className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
          <select name="barberId" defaultValue={params.barberId ?? ""} className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="">كل الحلاقين</option>
            {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
          </select>
          <select name="paymentMethod" defaultValue={params.paymentMethod ?? ""} className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="">كل طرق الدفع</option>
            <option value="CASH">كاش</option>
            <option value="NETWORK">شبكة</option>
          </select>
          <button className="rounded-md bg-salon-ink px-4 py-3 font-bold text-white">تطبيق</button>
        </form>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="قبل الخصم" value={formatMoney(revenue.grossAmount)} />
          <MetricCard label="الخصومات" value={formatMoney(revenue.discountAmount)} />
          <MetricCard label="الصافي" value={formatMoney(revenue.netAmount)} />
          <MetricCard label="متوسط الفاتورة" value={formatMoney(revenue.averageTicket)} />
          <MetricCard label="الكاش" value={formatMoney(revenue.cashAmount)} />
          <MetricCard label="الشبكة" value={formatMoney(revenue.networkAmount)} />
          <MetricCard label="الزيارات" value={revenue.visitsCount.toString()} />
          <MetricCard label="عملاء جدد / عائدون" value={`${revenue.newCustomersCount} / ${revenue.returningCustomersCount}`} />
          <MetricCard label="النقاط المكتسبة" value={revenue.pointsEarned.toString()} />
          <MetricCard label="النقاط المستبدلة" value={revenue.pointsRedeemed.toString()} />
          <MetricCard label="مكافآت مستخدمة" value={revenue.rewardRedemptionsCount.toString()} />
          <MetricCard label="حملات مستخدمة" value={revenue.campaignRedemptionsCount.toString()} />
        </div>

        <ReportSection title="أداء الحلاقين">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-salon-mist text-salon-charcoal">
              <tr>
                <Header>الحلاق</Header>
                <Header>الزيارات</Header>
                <Header>الصافي</Header>
                <Header>الكاش</Header>
                <Header>الشبكة</Header>
                <Header>الخصومات</Header>
                <Header>جدد / عائدون</Header>
                <Header>المتوسط</Header>
                <Header>النقاط</Header>
                <Header>مكافآت / حملات</Header>
              </tr>
            </thead>
            <tbody className="divide-y divide-salon-line">
              {barberPerformance.map((row) => (
                <tr key={row.barber.id}>
                  <Cell>{row.barber.name}</Cell>
                  <Cell>{row.visitsCount}</Cell>
                  <Cell>{formatMoney(row.netAmount)}</Cell>
                  <Cell>{formatMoney(row.cashAmount)}</Cell>
                  <Cell>{formatMoney(row.networkAmount)}</Cell>
                  <Cell>{formatMoney(row.discountAmount)}</Cell>
                  <Cell>{row.newCustomersCount} / {row.returningCustomersCount}</Cell>
                  <Cell>{formatMoney(row.averageTicket)}</Cell>
                  <Cell>{row.pointsEarned}</Cell>
                  <Cell>{row.rewardRedemptionsCount} / {row.campaignRedemptionsCount}</Cell>
                </tr>
              ))}
              {barberPerformance.length === 0 ? <EmptyRow colSpan={10} /> : null}
            </tbody>
          </table>
        </ReportSection>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <ReportSection title="الخدمات الأكثر طلبًا">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-salon-mist text-salon-charcoal">
                <tr><Header>الخدمة</Header><Header>الاستخدام</Header><Header>الزيارات</Header><Header>مبيعات مرتبطة</Header></tr>
              </thead>
              <tbody className="divide-y divide-salon-line">
                {services.slice(0, 12).map((service) => (
                  <tr key={service.serviceId}>
                    <Cell>{service.serviceName}</Cell>
                    <Cell>{service.usageCount}</Cell>
                    <Cell>{service.visitsCount}</Cell>
                    <Cell>{formatMoney(service.linkedSales)}</Cell>
                  </tr>
                ))}
                {services.length === 0 ? <EmptyRow colSpan={4} /> : null}
              </tbody>
            </table>
          </ReportSection>

          <ReportSection title="الخصومات">
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <MetricCard label="خصومات المكافآت" value={formatMoney(discounts.rewardDiscountAmount)} />
              <MetricCard label="خصومات الحملات" value={formatMoney(discounts.campaignDiscountAmount)} />
              <MetricCard label="استخدام المكافآت" value={discounts.rewardRedemptionsCount.toString()} />
              <MetricCard label="استخدام الحملات" value={discounts.campaignRedemptionsCount.toString()} />
            </div>
            <p className="px-4 pb-4 text-sm text-salon-charcoal">
              أكثر حملة استخدامًا: {discounts.topCampaign ? `${discounts.topCampaign.name} (${discounts.topCampaign.uses})` : "-"}
            </p>
          </ReportSection>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <ReportSection title="أفضل العملاء">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-salon-mist text-salon-charcoal">
                <tr><Header>العميل</Header><Header>الجوال</Header><Header>الزيارات</Header><Header>الصافي</Header><Header>آخر زيارة</Header><Header>النقاط</Header></tr>
              </thead>
              <tbody className="divide-y divide-salon-line">
                {customers.topCustomers.slice(0, 12).map((row) => (
                  <tr key={row.customer.id}>
                    <Cell>{row.customer.name}</Cell>
                    <Cell>{row.customer.phone}</Cell>
                    <Cell>{row.visitsCount}</Cell>
                    <Cell>{formatMoney(row.netAmount)}</Cell>
                    <Cell>{row.lastVisitAt ? new Date(row.lastVisitAt).toLocaleDateString("ar-SA") : "-"}</Cell>
                    <Cell>{row.pointsBalance}</Cell>
                  </tr>
                ))}
                {customers.topCustomers.length === 0 ? <EmptyRow colSpan={6} /> : null}
              </tbody>
            </table>
          </ReportSection>

          <ReportSection title="عملاء لم يزوروا منذ 30 يوم">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-salon-mist text-salon-charcoal">
                <tr><Header>العميل</Header><Header>الجوال</Header><Header>آخر زيارة</Header><Header>الأيام</Header><Header>النقاط</Header></tr>
              </thead>
              <tbody className="divide-y divide-salon-line">
                {customers.inactiveCustomers.slice(0, 12).map((row) => (
                  <tr key={row.customer.id}>
                    <Cell>{row.customer.name}</Cell>
                    <Cell>{row.customer.phone}</Cell>
                    <Cell>{row.lastVisitAt ? new Date(row.lastVisitAt).toLocaleDateString("ar-SA") : "-"}</Cell>
                    <Cell>{row.daysSinceLastVisit ?? "-"}</Cell>
                    <Cell>{row.pointsBalance}</Cell>
                  </tr>
                ))}
                {customers.inactiveCustomers.length === 0 ? <EmptyRow colSpan={5} /> : null}
              </tbody>
            </table>
          </ReportSection>
        </div>
      </section>
    </main>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 overflow-x-auto rounded-lg border border-salon-line bg-white">
      <h2 className="border-b border-salon-line px-4 py-4 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-salon-line bg-white p-4">
      <p className="text-sm text-salon-charcoal">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-3 text-right">{children}</th>;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-3">{children}</td>;
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return <tr><td colSpan={colSpan} className="px-4 py-8 text-center text-salon-charcoal">لا توجد بيانات</td></tr>;
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ريال`;
}

function startOfDay(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endExclusive(value: string) {
  const date = startOfDay(value);
  date.setDate(date.getDate() + 1);
  return date;
}
