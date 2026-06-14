import { redirect } from "next/navigation";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toCustomerDashboardRow } from "@/lib/customers/customer-summary";
import { DashboardShell, EmptyState, FilterBar, TablePanel } from "@/components/dashboard/ui";
import { CustomerWhatsAppToggle } from "@/components/dashboard/customer-whatsapp-toggle";

export default async function DashboardCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const params = await searchParams;
  const q = params.q?.trim();
  const status = params.status ?? "all";
  const customers = await prisma.customer.findMany({
    where: {
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
    include: { loyaltyAccount: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const rows = customers.map(toCustomerDashboardRow);

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

        <TablePanel className="overflow-hidden">
          <div className="grid grid-cols-[1fr_150px_100px_110px_150px_140px] gap-3 border-b border-salon-line px-4 py-3 text-sm font-bold text-salon-charcoal">
            <span>الاسم</span>
            <span>الجوال</span>
            <span>النقاط</span>
            <span>الزيارات</span>
            <span>واتساب</span>
            <span>تاريخ الإنشاء</span>
          </div>
          <div className="divide-y divide-salon-line">
            {rows.map((customer) => (
              <div key={customer.id} className="grid grid-cols-[1fr_150px_100px_110px_150px_140px] gap-3 px-4 py-3 text-sm">
                <span className="font-bold">{customer.name}</span>
                <span>{customer.phone}</span>
                <span>{customer.pointsBalance}</span>
                <span>{customer.visitsCount}</span>
                <span><CustomerWhatsAppToggle customerId={customer.id} initialOptIn={customer.whatsappOptIn} /></span>
                <span>{new Date(customer.createdAt).toLocaleDateString("ar-SA")}</span>
              </div>
            ))}
            {rows.length === 0 ? <div className="p-5"><EmptyState title="لا توجد نتائج" description="جرّب تغيير كلمة البحث أو حالة العميل." /></div> : null}
          </div>
        </TablePanel>
    </DashboardShell>
  );
}
