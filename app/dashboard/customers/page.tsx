import { redirect } from "next/navigation";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toCustomerDashboardRow } from "@/lib/customers/customer-summary";
import { DashboardShell, EmptyState, FilterBar, TablePanel } from "@/components/dashboard/ui";
import { CustomerWhatsAppToggle } from "@/components/dashboard/customer-whatsapp-toggle";
import { ManagerRewardButton } from "@/components/dashboard/manager-reward-button";

export default async function DashboardCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const organizationId = session.type === "dashboard" ? session.organizationId : undefined;
  const params = await searchParams;
  const q = params.q?.trim();
  const status = params.status ?? "all";
  const now = new Date();
  const customers = await prisma.customer.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q.replace(/^\+/, "") } },
            ],
          }
        : {}),
      ...(status === "new" ? { visitCount: 0 } : {}),
      ...(status === "visited" ? { visitCount: { gt: 0 } } : {}),
    },
    include: {
      loyaltyAccount: true,
      managerRewards: {
        where: {
          redeemedAt: null,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const rows = customers.map((customer) => ({
    ...toCustomerDashboardRow(customer),
    activeManagerRewards: customer.managerRewards.length,
  }));

  return (
    <DashboardShell title="العملاء" description="بحث سريع في العملاء، متابعة النقاط والزيارات، والتحكم بتفضيل رسائل واتساب.">
        <FilterBar className="md:grid-cols-[1fr_190px_130px]">
          <input name="q" defaultValue={q} placeholder="بحث بالاسم أو رقم الجوال" className="dashboard-field" />
          <select name="status" defaultValue={status} className="dashboard-field">
            <option value="all">كل العملاء</option>
            <option value="new">عملاء جدد</option>
            <option value="visited">عملاء لديهم زيارات</option>
          </select>
          <button className="dashboard-button">تصفية</button>
        </FilterBar>

        <TablePanel>
          <div className="hidden grid-cols-[1fr_150px_90px_90px_120px_120px_130px_130px] gap-3 border-b border-salon-line px-4 py-3 text-sm font-bold text-salon-charcoal lg:grid">
            <span>الاسم</span>
            <span>الجوال</span>
            <span>النقاط</span>
            <span>الزيارات</span>
            <span>مكافآت الإدارة</span>
            <span>واتساب</span>
            <span>تاريخ الإنشاء</span>
            <span>إجراء</span>
          </div>
          <div className="divide-y divide-salon-line">
            {rows.map((customer) => (
              <div
                key={customer.id}
                className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-sm lg:grid-cols-[1fr_150px_90px_90px_120px_120px_130px_130px] lg:items-center lg:gap-3 lg:py-3"
              >
                <Cell label="الاسم" className="col-span-2 lg:col-span-1"><span className="font-bold">{customer.name}</span></Cell>
                <Cell label="الجوال">{customer.phone}</Cell>
                <Cell label="النقاط">{customer.pointsBalance}</Cell>
                <Cell label="الزيارات">{customer.visitsCount}</Cell>
                <Cell label="مكافآت الإدارة">{customer.activeManagerRewards}</Cell>
                <Cell label="واتساب"><CustomerWhatsAppToggle customerId={customer.id} initialOptIn={customer.whatsappOptIn} /></Cell>
                <Cell label="تاريخ الإنشاء">{new Date(customer.createdAt).toLocaleDateString("ar-SA")}</Cell>
                <Cell label="إجراء" className="col-span-2 lg:col-span-1"><ManagerRewardButton customerId={customer.id} customerName={customer.name} /></Cell>
              </div>
            ))}
            {rows.length === 0 ? <div className="p-5"><EmptyState title="لا توجد نتائج" description="جرّب تغيير كلمة البحث أو حالة العميل." /></div> : null}
          </div>
        </TablePanel>
    </DashboardShell>
  );
}

function Cell({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid gap-1 lg:block ${className}`}>
      <span className="text-xs font-bold text-salon-charcoal lg:hidden">{label}</span>
      <span className="font-semibold lg:font-normal">{children}</span>
    </div>
  );
}
