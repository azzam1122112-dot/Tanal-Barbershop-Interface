import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { ServiceManager } from "@/components/dashboard/service-manager";
import { canAccessDashboard } from "@/lib/auth/access";
import { getRequestSession } from "@/lib/auth/http";
import { prisma } from "@/lib/db/prisma";
import { toSafeService } from "@/lib/services/service-summary";

export default async function DashboardServicesPage() {
  const session = await getRequestSession();
  if (!session) redirect("/dashboard/login");
  if (!canAccessDashboard(session)) redirect("/barber");

  const services = await prisma.service.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <main className="min-h-screen bg-salon-mist px-5 py-8 text-salon-ink">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 border-b border-salon-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm font-bold text-salon-gold">لوحة الإدارة</Link>
            <h1 className="mt-2 text-3xl font-bold">الخدمات</h1>
          </div>
          <LogoutButton />
        </div>
        <ServiceManager initialServices={services.map((service) => toSafeService(service, true))} />
      </section>
    </main>
  );
}
