import Link from "next/link";
import type { OrganizationStatus } from "@prisma/client";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PlatformOrganizations } from "@/components/platform/platform-organizations";
import { prisma } from "@/lib/db/prisma";
import { listOrganizations, listPlans } from "@/lib/platform/platform-service";

export default async function PlatformOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; planId?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = params.status === "ACTIVE" || params.status === "SUSPENDED" ? (params.status as OrganizationStatus) : undefined;
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const [result, plans] = await Promise.all([
    listOrganizations(prisma, { q: params.q?.trim(), status, planId: params.planId || undefined, page }),
    listPlans(prisma),
  ]);

  return (
    <PlatformShell active="orgs" title="المؤسسات" description="إدارة كل المؤسسات: الباقة، الاشتراك، التجربة، والإيقاف.">
      <form className="dashboard-panel mt-6 grid gap-3 p-4 md:grid-cols-[1fr_170px_200px_110px]">
        <input name="q" defaultValue={params.q} placeholder="بحث بالاسم أو المعرّف" className="dashboard-field" />
        <select name="status" defaultValue={params.status ?? ""} className="dashboard-field">
          <option value="">كل الحالات</option>
          <option value="ACTIVE">نشطة</option>
          <option value="SUSPENDED">موقوفة</option>
        </select>
        <select name="planId" defaultValue={params.planId ?? ""} className="dashboard-field">
          <option value="">كل الباقات</option>
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
        <button className="dashboard-button">تصفية</button>
      </form>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-salon-line bg-white/80 px-4 py-3 text-sm font-bold text-salon-charcoal shadow-sm">
        <span>{result.total.toLocaleString("ar-SA")} مؤسسة</span>
        <span>صفحة {result.page} من {result.totalPages}</span>
      </div>

      <PlatformOrganizations
        initialOrganizations={result.rows}
        plans={plans
          .filter((plan) => plan.isActive)
          .map((plan) => ({ id: plan.id, name: plan.name, maxSalons: plan.maxSalons, maxBarbers: plan.maxBarbers, maxCustomers: plan.maxCustomers }))}
      />

      {result.totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-3">
          <PageLink params={params} page={result.page - 1} disabled={result.page <= 1}>السابق</PageLink>
          <span className="text-sm font-bold text-salon-charcoal">صفحة {result.page} / {result.totalPages}</span>
          <PageLink params={params} page={result.page + 1} disabled={result.page >= result.totalPages}>التالي</PageLink>
        </nav>
      ) : null}
    </PlatformShell>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: { q?: string; status?: string; planId?: string };
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="rounded-lg border border-salon-line bg-salon-mist px-4 py-2 text-sm font-bold text-salon-charcoal/45">{children}</span>;
  }
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.planId) search.set("planId", params.planId);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return <Link href={query ? `/platform/organizations?${query}` : "/platform/organizations"} className="dashboard-button-soft px-4 py-2 text-sm">{children}</Link>;
}
