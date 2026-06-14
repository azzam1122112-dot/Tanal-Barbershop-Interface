import Link from "next/link";
import { redirect } from "next/navigation";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toCustomerDashboardRow } from "@/lib/customers/customer-summary";
import { LogoutButton } from "@/components/logout-button";
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
    <main className="min-h-screen bg-salon-mist px-5 py-8 text-salon-ink">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 border-b border-salon-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-bold text-salon-gold">لوحة الإدارة</Link>
            <h1 className="mt-2 text-3xl font-bold">العملاء</h1>
          </div>
          <LogoutButton />
        </div>

        <form className="mt-6 grid gap-3 rounded-lg border border-salon-line bg-white p-4 md:grid-cols-[1fr_180px_120px]">
          <input name="q" defaultValue={q} placeholder="بحث بالاسم أو رقم الجوال" className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold" />
          <select name="status" defaultValue={status} className="rounded-md border border-salon-line px-3 py-3 outline-none focus:border-salon-gold">
            <option value="all">كل العملاء</option>
            <option value="new">عملاء جدد</option>
            <option value="visited">عملاء لديهم زيارات</option>
          </select>
          <button className="rounded-md bg-salon-ink px-4 py-3 font-bold text-white">تصفية</button>
        </form>

        <div className="mt-6 overflow-hidden rounded-lg border border-salon-line bg-white">
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
            {rows.length === 0 ? <p className="px-4 py-8 text-center text-salon-charcoal">لا توجد نتائج</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
