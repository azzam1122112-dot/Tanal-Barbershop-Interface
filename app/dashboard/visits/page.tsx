import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { DashboardShell, EmptyState, FilterBar, TablePanel } from "@/components/dashboard/ui";
import { VisitsLedger } from "@/components/dashboard/visits-ledger";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toVisitDashboardRow } from "@/lib/visits/visit-summary";

const PAGE_SIZE = 50;

export default async function DashboardVisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; paymentMethod?: string; barberId?: string; status?: string; page?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const params = await searchParams;
  const q = params.q?.trim();
  const paymentMethod = params.paymentMethod === "CASH" || params.paymentMethod === "NETWORK" ? params.paymentMethod : undefined;
  const status = params.status === "COMPLETED" || params.status === "CANCELLED" ? params.status : undefined;
  const requestedPage = parsePage(params.page);
  const organizationId = session.type === "dashboard" ? session.organizationId : undefined;
  const salonId = session.type === "dashboard" ? session.salonId : undefined;
  const where: Prisma.VisitWhereInput = {
    ...(organizationId ? { organizationId } : {}),
    ...(salonId ? { salonId } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(status ? { status } : {}),
    ...(params.barberId ? { barberId: params.barberId } : {}),
    ...(q
      ? {
          OR: [
            { customer: { name: { contains: q, mode: "insensitive" } } },
            { customer: { phone: { contains: q.replace(/^\+/, "") } } },
          ],
        }
      : {}),
  };

  const orgFilter = organizationId ? { organizationId } : {};
  const [totalVisits, barbers, rewardRules, campaigns] = await Promise.all([
    prisma.visit.count({ where }),
    prisma.barber.findMany({ where: { ...orgFilter, ...(salonId ? { salonId } : {}) }, orderBy: { name: "asc" } }),
    prisma.rewardRule.findMany({ where: orgFilter }),
    prisma.campaign.findMany({ where: orgFilter }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalVisits / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const visits = await prisma.visit.findMany({
    where,
    include: { customer: true, barber: true, services: true, cancelledBy: true },
    orderBy: { visitedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const rows = visits.map(toVisitDashboardRow);
  const firstItem = totalVisits === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(page * PAGE_SIZE, totalVisits);
  const discountMaps = {
    rewards: Object.fromEntries(rewardRules.map((reward) => [reward.id, `خصم ${Number(reward.discountAmount)} / ${reward.requiredPoints} نقطة`])),
    campaigns: Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign.name])),
  };

  return (
    <DashboardShell title="الزيارات" description="سجل سريع قابل للتصفية والتصحيح.">
        <FilterBar className="md:grid-cols-[minmax(220px,1fr)_150px_150px_180px_110px]">
          <input name="q" defaultValue={q} placeholder="بحث باسم أو جوال العميل" className="dashboard-field" />
          <select name="paymentMethod" defaultValue={paymentMethod ?? ""} className="dashboard-field">
            <option value="">كل طرق الدفع</option>
            <option value="CASH">كاش</option>
            <option value="NETWORK">شبكة</option>
          </select>
          <select name="status" defaultValue={status ?? ""} className="dashboard-field">
            <option value="">كل الحالات</option>
            <option value="COMPLETED">مؤكدة</option>
            <option value="CANCELLED">ملغاة</option>
          </select>
          <select name="barberId" defaultValue={params.barberId ?? ""} className="dashboard-field">
            <option value="">كل الحلاقين</option>
            {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
          </select>
          <button className="dashboard-button">تصفية</button>
        </FilterBar>

        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-salon-line bg-white/80 px-4 py-3 text-sm font-bold text-salon-charcoal shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <span>{totalVisits.toLocaleString("ar-SA")} زيارة</span>
          <span>يعرض {firstItem.toLocaleString("ar-SA")} - {lastItem.toLocaleString("ar-SA")}</span>
        </div>

        <TablePanel className="mt-3">
          {rows.length ? <VisitsLedger visits={rows} discounts={discountMaps} /> : <div className="p-5"><EmptyState title="لا توجد زيارات" description="غيّر الفلاتر أو وسّع البحث لرؤية نتائج أكثر." /></div>}
        </TablePanel>

        <Pagination page={page} totalPages={totalPages} params={params} />
    </DashboardShell>
  );
}

function Pagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: { q?: string; paymentMethod?: string; barberId?: string; status?: string; page?: string };
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-4 flex items-center justify-between gap-3">
      <PageLink disabled={page <= 1} href={buildPageHref(params, page - 1)}>السابق</PageLink>
      <span className="text-sm font-black text-salon-charcoal">
        صفحة {page.toLocaleString("ar-SA")} من {totalPages.toLocaleString("ar-SA")}
      </span>
      <PageLink disabled={page >= totalPages} href={buildPageHref(params, page + 1)}>التالي</PageLink>
    </nav>
  );
}

function PageLink({ children, href, disabled }: { children: React.ReactNode; href: string; disabled: boolean }) {
  if (disabled) {
    return <span className="rounded-lg border border-salon-line bg-salon-mist px-4 py-2 text-sm font-black text-salon-charcoal/45">{children}</span>;
  }

  return <Link href={href} className="dashboard-button-soft px-4 py-2 text-sm">{children}</Link>;
}

function buildPageHref(params: { q?: string; paymentMethod?: string; barberId?: string; status?: string }, page: number) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.paymentMethod) search.set("paymentMethod", params.paymentMethod);
  if (params.barberId) search.set("barberId", params.barberId);
  if (params.status) search.set("status", params.status);
  if (page > 1) search.set("page", page.toString());
  const query = search.toString();
  return query ? `/dashboard/visits?${query}` : "/dashboard/visits";
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}
